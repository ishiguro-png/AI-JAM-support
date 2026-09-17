# AI JAM サポート管理システム

admin.torimato.jp の契約管理システムから、サポートプラン対象（5アカウント以上 / 10アカウント以上 / 30アカウント以上）の契約先を抽出・管理するための社内ツールです。

- torimato からエクスポートしたCSVを取り込み、アカウント数に応じてサポートプラン（5+ / 10+ / 30+）を自動判定
- 契約先ごとにサポートメールをGmail経由で送信し、送信内容・送信結果を自動で対応履歴に記録
- 電話・訪問・メモなどメール以外の対応も手動で記録でき、誰が対応しても同じ画面で経緯が追える
- ログイン機能は設けず、社内アクセスのみを前提とした簡易システムです（担当者名は入力式で記録）

## 技術構成

- Next.js 14 (App Router) + TypeScript
- Prisma + SQLite（ファイルDB、`prisma/dev.db`）
- Tailwind CSS
- Nodemailer（Gmail SMTP、アプリパスワード方式）
- PapaParse（CSVパース、列マッピングはブラウザ上で実施）

## セットアップ

```bash
npm install
cp .env.example .env
# .env を編集: GMAIL_USER / GMAIL_APP_PASSWORD を設定
npx prisma migrate dev --name init
npm run seed   # 担当者・メールテンプレートの初期データ投入（任意）
npm run dev
```

http://localhost:3000 で起動します。

### Gmail送信の設定

サポートメールは実際にGmail経由で送信されます。送信専用のGoogleアカウント（または担当部署のアカウント）で以下を行ってください。

1. Googleアカウントで2段階認証を有効化
2. https://myaccount.google.com/apppasswords でアプリパスワードを発行
3. `.env` の `GMAIL_USER` に送信元アドレス、`GMAIL_APP_PASSWORD` に発行されたアプリパスワードを設定

## 使い方

1. **CSVインポート**（`/contracts/import`）: torimatoからエクスポートしたCSVをアップロードし、列とシステム項目（会社名・アカウント数など）を対応付けて取り込みます。会社名が一致する既存契約は上書き更新されます。
2. **契約一覧**（`/contracts`）: サポートプラン（5+/10+/30+）やステータスで絞り込み、対象契約先を確認できます。
3. **契約詳細**（`/contracts/[id]`）: 契約先ごとにサポートメールの送信、対応履歴（電話・訪問・メモ等）の記録、これまでの対応履歴の閲覧ができます。
4. **メールテンプレート**（`/templates`）: プラン別の定型連絡文をあらかじめ登録し、送信フォームから呼び出せます。
5. **担当者管理**（`/staff`）: 対応記録・メール送信時に選択する担当者名を管理します。

## データモデル

- `Contract`: 契約先情報（会社名・アカウント数・プラン・連絡先・ステータス）
- `SupportLog`: 対応履歴（メール送信ログを含む。種別・担当者・内容・日時）
- `EmailTemplate`: プラン別メールテンプレート
- `Staff`: 対応記録用の担当者名リスト
