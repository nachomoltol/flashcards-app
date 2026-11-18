import { NextRequest, NextResponse } from 'next/server';
import {
  generateCardsAction,
  generateCardsFromDocumentAction,
} from '@/app/actions/generateCards';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const headerDeviceId = req.headers.get('x-device-id') || undefined;
    const deviceId = (typeof body.deviceId === 'string' ? body.deviceId : undefined) || headerDeviceId;

    if (body.documentInput) {
      if (!body.documentInput.deviceId && deviceId) {
        body.documentInput.deviceId = deviceId;
      }
      const result = await generateCardsFromDocumentAction(body.documentInput);
      return NextResponse.json(result);
    }

    if (!body.topic || typeof body.topic !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Falta el parámetro obligatorio: topic' },
        { status: 400 }
      );
    }

    const result = await generateCardsAction(
      body.topic,
      body.cardFormat,
      body.cardCount,
      body.deckId || body.customPrompt,
      body.existingQuestions,
      body.userId,
      body.language,
      body.coreExhaustedPrevious,
      body.pedagogicalMode,
      body.docenteFormat,
      body.targetAudience,
      body.isPracticalMode || false,
      deviceId
    );

    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error interno en generación de tarjetas.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

