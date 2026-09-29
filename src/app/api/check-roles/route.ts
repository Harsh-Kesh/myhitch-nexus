import { NextResponse } from "next/server";
import { query } from "@/lib/server/db";

export async function GET() {
  try {
    await query(`alter table account_roles drop constraint if exists account_roles_role_check`);
    await query(`alter table account_roles add constraint account_roles_role_check check (
      role in (
        'viewer',
        'creator',
        'business',
        'producer',
        'education',
        'organisation',
        'advertiser',
        'super-admin'
      )
    )`);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
