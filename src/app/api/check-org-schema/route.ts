import { NextResponse } from "next/server";
import { query } from "@/lib/server/db";

export async function GET() {
  try {
    const res = await query(`SELECT conname, pg_get_constraintdef(c.oid)
      FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE conrelid = 'organizations'::regclass;`);
    return NextResponse.json({ constraints: res });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
