import { NextResponse } from "next/server";
import { readUiSettings, writeUiSettings } from "@/lib/uiSettings";
import type { DiffThemePref, ReviewEngine, Theme } from "@/lib/uiSettingsRules";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await readUiSettings());
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    theme?: Theme;
    diffTheme?: DiffThemePref;
    reviewEngine?: ReviewEngine;
  };
  return NextResponse.json(
    await writeUiSettings({
      theme: body.theme,
      diffTheme: body.diffTheme,
      reviewEngine: body.reviewEngine,
    })
  );
}
