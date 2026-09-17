import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  for (const name of ["サポート担当A", "サポート担当B"]) {
    await prisma.staff.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  const templates = [
    {
      name: "5アカウント以上プラン ご案内",
      planTier: "5+",
      subject: "【AI JAM】サポートプランのご案内",
      body: [
        "いつもAI JAMをご利用いただきありがとうございます。",
        "",
        "貴社は現在5アカウント以上でご利用いただいているため、サポートプランの対象となります。",
        "ご不明点やご要望がございましたら、本メールへの返信にてお気軽にご連絡ください。",
        "",
        "引き続きよろしくお願いいたします。",
      ].join("\n"),
    },
    {
      name: "10アカウント以上プラン ご案内",
      planTier: "10+",
      subject: "【AI JAM】上位サポートプランのご案内",
      body: [
        "いつもAI JAMをご利用いただきありがとうございます。",
        "",
        "貴社は現在10アカウント以上でご利用いただいているため、より手厚いサポートプランをご案内いたします。",
        "定期的な活用状況のご確認や個別のご相談も承っておりますので、ご希望の日程がございましたらご返信ください。",
      ].join("\n"),
    },
    {
      name: "30アカウント以上プラン ご案内",
      planTier: "30+",
      subject: "【AI JAM】専任サポートのご案内",
      body: [
        "いつもAI JAMをご利用いただきありがとうございます。",
        "",
        "貴社は30アカウント以上の大規模ご利用のため、専任担当によるサポートをご案内いたします。",
        "定例ミーティングの設定も可能ですので、ご希望の際はご返信ください。",
      ].join("\n"),
    },
  ];

  for (const t of templates) {
    const existing = await prisma.emailTemplate.findFirst({ where: { name: t.name } });
    if (!existing) {
      await prisma.emailTemplate.create({ data: t });
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
