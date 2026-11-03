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

    if (body.documentInput) {
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
      body.customPrompt,
      body.existingQuestions,
      body.language,
      body.coreExhaustedPrevious,
      body.isExhaustiveMode,
      body.pedagogicalMode,
      body.docenteFormat,
      body.targetAudience
    );

    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error interno en generación de tarjetas.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

