import { NextResponse } from "next/server";
import { requireAuth, getEffectiveUserId } from "@/lib/api-auth";
import {
  deleteStub,
  findStubForRecord,
  findStubForWeek,
  saveStub,
} from "@/lib/repos/pay-stubs";
import type { PayStubLine, PayStubScope } from "@/lib/pay-stub";

const SCOPES: PayStubScope[] = ["day", "week"];

/**
 * GET /api/pay-stubs?workRecordId=…            — the stub for a work day
 * GET /api/pay-stubs?weekStart=…&showName=…    — the stub for a weekly week
 */
export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const userId = await getEffectiveUserId(auth.session);

    const { searchParams } = new URL(request.url);
    const workRecordId = searchParams.get("workRecordId");
    const weekStart = searchParams.get("weekStart");

    if (workRecordId) {
      return NextResponse.json({
        stub: await findStubForRecord(userId, workRecordId),
      });
    }
    if (weekStart) {
      return NextResponse.json({
        stub: await findStubForWeek(
          userId,
          weekStart,
          searchParams.get("showName") ?? ""
        ),
      });
    }
    return NextResponse.json(
      { error: "workRecordId or weekStart is required" },
      { status: 400 }
    );
  } catch (error) {
    console.error("pay stub GET error:", error);
    return NextResponse.json(
      { error: "Failed to load the pay stub" },
      { status: 500 }
    );
  }
}

/** PUT /api/pay-stubs — save the stub for a day or a week, replacing any before it. */
export async function PUT(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const userId = await getEffectiveUserId(auth.session);

    const body = (await request.json()) as {
      scope?: PayStubScope;
      workRecordId?: string;
      weekStart?: string;
      showName?: string;
      lineItems?: PayStubLine[];
      documents?: unknown[];
    };

    if (!body.scope || !SCOPES.includes(body.scope)) {
      return NextResponse.json(
        { error: "scope must be 'day' or 'week'" },
        { status: 400 }
      );
    }
    if (body.scope === "day" && !body.workRecordId) {
      return NextResponse.json(
        { error: "workRecordId is required for a day stub" },
        { status: 400 }
      );
    }
    if (body.scope === "week" && !body.weekStart) {
      return NextResponse.json(
        { error: "weekStart is required for a week stub" },
        { status: 400 }
      );
    }

    // Keep only what a line actually is, so nothing else rides along.
    const lineItems: PayStubLine[] = (body.lineItems ?? []).map((line) => ({
      label: String(line?.label ?? "").slice(0, 120),
      hours:
        line?.hours === null || line?.hours === undefined || line.hours === ("" as unknown)
          ? null
          : Number(line.hours) || 0,
      amount: Number(line?.amount) || 0,
    }));

    const stub = await saveStub(userId, {
      scope: body.scope,
      workRecordId: body.workRecordId ?? null,
      weekStart: body.weekStart ?? null,
      showName: body.showName ?? "",
      lineItems,
      documents: (body.documents ?? []) as never[],
    });

    return NextResponse.json({ stub });
  } catch (error) {
    console.error("pay stub PUT error:", error);
    return NextResponse.json(
      { error: "Failed to save the pay stub" },
      { status: 500 }
    );
  }
}

/** DELETE /api/pay-stubs?id=… */
export async function DELETE(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const userId = await getEffectiveUserId(auth.session);

    const id = new URL(request.url).searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    await deleteStub(userId, id);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("pay stub DELETE error:", error);
    return NextResponse.json(
      { error: "Failed to delete the pay stub" },
      { status: 500 }
    );
  }
}
