import {
  BadRequestException, Body, Controller, Get, Logger, NotFoundException, Param, ParseUUIDPipe, Post, Res, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AiEngineClient } from '../../common/ai/ai-engine.client';
import { AuditService } from '../../common/audit/audit.service';
import { AuthPrincipal, grantsFor } from '../../common/auth/principal';
import { CurrentPrincipal, RequirePermission } from '../../common/auth/public.decorator';
import { sha256 } from '../../common/crypto/crypto.service';
import { DbService, one, rows } from '../../common/db/db.service';
import { classification, uuid } from '../../common/http/schemas';
import { ZodPipe } from '../../common/http/zod.pipe';
import { assertCanAtOrg } from '../../common/scope';
import { StorageService } from '../../common/storage/storage.service';
import { AiService } from '../ai/ai.service';

const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
]);

const uploadBody = z.object({
  organization_id: uuid,
  title: z.string().min(2).max(500),
  classification: classification.default('internal'),
});

const CLASS_LEVEL = { public: 0, internal: 1, confidential: 2, secret: 3 } as const;

@ApiTags('documents')
@ApiBearerAuth()
@Controller('documents')
export class DocumentsController {
  private readonly logger = new Logger('Documents');

  constructor(
    private readonly db: DbService,
    private readonly storage: StorageService,
    private readonly ai: AiEngineClient,
    private readonly aiService: AiService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermission('documents.read')
  list(@CurrentPrincipal() p: AuthPrincipal) {
    return this.db.scoped(p, 'documents.read', (tx) =>
      rows(
        tx,
        `SELECT d.id, d.title, d.mime_type, d.page_count, d.classification, d.index_status, d.chunk_count, d.created_at,
                o.name AS organization_name, u.full_name AS uploaded_by_name
         FROM core.documents d JOIN organization.organizations o ON o.id = d.organization_id
         JOIN iam.users u ON u.id = d.uploaded_by ORDER BY d.created_at DESC LIMIT 500`,
      ),
    );
  }

  @Post()
  @RequirePermission('documents.upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } }))
  async upload(@CurrentPrincipal() p: AuthPrincipal, @UploadedFile() file: Express.Multer.File | undefined, @Body() raw: unknown) {
    const body = new ZodPipe(uploadBody).transform(raw);
    if (!file) throw new BadRequestException('file is required');
    if (!ALLOWED_MIME.has(file.mimetype)) throw new BadRequestException('Unsupported file type');

    const id = randomUUID();
    const objectKey = `documents/${body.organization_id}/${id}`;
    const { path } = await this.db.scoped(p, 'documents.upload', async (tx) => {
      const path = await assertCanAtOrg(tx, p, 'documents.upload', body.organization_id, body.classification);
      return { path };
    });
    await this.storage.put(objectKey, file.buffer);
    await this.db.scoped(p, 'documents.upload', async (tx) => {
      await tx.query(
        `INSERT INTO core.documents (id, organization_id, title, object_key, mime_type, sha256, classification, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [id, body.organization_id, body.title, objectKey, file.mimetype, sha256(file.buffer), body.classification, p.actorId],
      );
      await this.audit.record(tx, p, {
        action: 'document.uploaded', resourceType: 'core.documents', resourceId: id, organizationId: body.organization_id,
        data: { title: body.title, size: file.size, classification: body.classification },
      });
    });

    // Indekslash: hujjat matni ai-engine'da ajratiladi, bo'laklanadi va Qdrant'ga
    // hudud yo'li va maxfiylik darajasi bilan joylanadi.
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(file.buffer)], { type: file.mimetype }), file.originalname);
    form.append('document_id', id);
    form.append('title', body.title);
    form.append('organization_id', body.organization_id);
    form.append('admin_unit_path', path);
    form.append('classification_level', String(CLASS_LEVEL[body.classification]));
    let status: 'indexed' | 'failed' = 'indexed';
    let chunks: number | null = null;
    let pages: number | null = null;
    let error: string | null = null;
    try {
      const res = await this.ai.ragIndex(form);
      chunks = res.chunks;
      pages = res.pages;
    } catch (e) {
      status = 'failed';
      error = e instanceof Error ? e.message.slice(0, 500) : 'index error';
      this.logger.warn(`indexing failed for ${id}: ${error}`);
    }
    return this.db.scoped(p, 'documents.upload', (tx) =>
      one(
        tx,
        `UPDATE core.documents SET index_status = $2::text, chunk_count = $3, page_count = $4, index_error = $5,
           indexed_at = CASE WHEN $2::text = 'indexed' THEN now() END
         WHERE id = $1 RETURNING id, title, index_status, chunk_count, page_count`,
        [id, status, chunks, pages, error],
      ),
    );
  }

  @Post('search')
  @RequirePermission('documents.read')
  async search(@CurrentPrincipal() p: AuthPrincipal, @Body(new ZodPipe(z.object({ query: z.string().min(2).max(1000) }))) body: { query: string }) {
    const { hits } = await this.ai.ragSearch({ query: body.query, grants: grantsFor(p, 'documents.read'), limit: 10 });
    const visible = await this.aiService.visibleDocumentIds(p, hits.map((h) => h.document_id));
    await this.db.scoped(p, 'documents.read', (tx) =>
      this.audit.record(tx, p, { action: 'document.searched', resourceType: 'core.documents', data: { query: body.query, hits: hits.length } }),
    );
    return { hits: hits.filter((h) => visible.has(h.document_id)) };
  }

  @Get(':id/download')
  @RequirePermission('documents.read')
  async download(@CurrentPrincipal() p: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const doc = await this.db.scoped(p, 'documents.read', async (tx) => {
      const d = await one<{ object_key: string; mime_type: string; title: string; organization_id: string; sha256: string }>(
        tx,
        'SELECT object_key, mime_type, title, organization_id, sha256 FROM core.documents WHERE id = $1',
        [id],
      );
      if (!d) throw new NotFoundException();
      await this.audit.record(tx, p, { action: 'document.downloaded', resourceType: 'core.documents', resourceId: id, organizationId: d.organization_id });
      return d;
    });
    const data = await this.storage.get(doc.object_key);
    if (sha256(data) !== doc.sha256) throw new NotFoundException('Stored object integrity check failed');
    res.setHeader('Content-Type', doc.mime_type);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(doc.title)}`);
    res.send(data);
  }
}
