import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;

  const bill = await prisma.bill.findUnique({
    where: { tableCode: code.toUpperCase() },
    include: {
      participants: { orderBy: { joinedAt: "asc" } },
      items: { include: { claims: true }, orderBy: { createdAt: "asc" } },
      settlements: true,
      auditLogs: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!bill) {
    return NextResponse.json({ error: "Table not found" }, { status: 404 });
  }

  return NextResponse.json(bill);
}
