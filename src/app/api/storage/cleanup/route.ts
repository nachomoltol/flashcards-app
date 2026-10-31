import { NextRequest, NextResponse } from 'next/server';
import { deleteDocumentAction } from '@/app/actions/storageCleanup';

export async function POST(req: NextRequest) {
  try {
    let storagePath = '';

    // Manejar JSON, FormData o texto plano (para soportar sendBeacon o fetch keepalive)
    const contentType = req.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const body = await req.json().catch(() => ({}));
      storagePath = body.storagePath || '';
    } else if (contentType.includes('multipart/form-data') || contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await req.formData().catch(() => null);
      storagePath = (formData?.get('storagePath') as string) || '';
    } else {
      const text = await req.text().catch(() => '');
      try {
        const parsed = JSON.parse(text);
        storagePath = parsed.storagePath || '';
      } catch {
        storagePath = text.trim();
      }
    }

    if (!storagePath) {
      return NextResponse.json({ ok: false, error: 'storagePath requerido' }, { status: 400 });
    }

    const result = await deleteDocumentAction(storagePath);
    return NextResponse.json({ ok: result.success, error: result.error });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

