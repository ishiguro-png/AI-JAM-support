import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendSupportEmail } from "@/lib/mailer";

// POST /api/contracts/[id]/send-email
// body: { staffName, to?, cc?, subject, body }
// Gmail経由で実送信し、成否にかかわらず対応履歴(SupportLog)に自動記録する。
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await req.json();
  const { staffName, to, cc, subject, body: emailBody } = body;

  if (!staffName || !subject || !emailBody) {
    return NextResponse.json(
      { error: "staffName, subject, body は必須です" },
      { status: 400 }
    );
  }

  const contract = await prisma.contract.findUnique({ where: { id: params.id } });
  if (!contract) {
    return NextResponse.json({ error: "契約が見つかりません" }, { status: 404 });
  }

  const recipient = to || contract.contactEmail;
  if (!recipient) {
    return NextResponse.json(
      { error: "送信先メールアドレスがありません（契約先の連絡先を登録してください）" },
      { status: 400 }
    );
  }

  let emailStatus: "sent" | "failed" = "sent";
  let errorMessage: string | null = null;

  try {
    await sendSupportEmail({ to: recipient, cc, subject, body: emailBody });
  } catch (e) {
    emailStatus = "failed";
    errorMessage = e instanceof Error ? e.message : "送信に失敗しました";
  }

  const log = await prisma.supportLog.create({
    data: {
      contract: { connect: { id: params.id } },
      type: "email",
      staffName,
      subject,
      content: errorMessage ? `${emailBody}\n\n[送信エラー] ${errorMessage}` : emailBody,
      emailTo: recipient,
      emailStatus,
    },
  });

  if (emailStatus === "failed") {
    return NextResponse.json({ log, error: errorMessage }, { status: 502 });
  }

  return NextResponse.json({ log }, { status: 201 });
}
