import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-page";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [{ title: "隐私政策 · 锋口" }],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <LegalPage title="隐私政策">
      <p>更新日期：2026年9月6日。本政策说明锋口如何处理你在使用本产品时提供的信息。</p>

      <h2>我们收集的信息</h2>
      <p>
        为提供账户与个人研判台，我们可能处理：注册邮箱、用户名、登录凭证（经加密或哈希保存）、
        观察池与仓位等业务数据，以及为保障服务安全所需的基本技术日志。
      </p>

      <h2>使用目的</h2>
      <p>
        用于身份验证、保存你的观察池与流水、提供研判与行情相关功能，以及排查故障、防止滥用。
        我们不会将你的账户内容出售给第三方广告商。
      </p>

      <h2>第三方与公开数据</h2>
      <p>
        行情、新闻等可能来自公开接口或第三方数据源。若你使用社交账号登录，将依该提供方的授权范围获取必要身份信息。
      </p>

      <h2>数据保存与控制</h2>
      <p>
        你可登录后管理自己的资料与仓位记录。停止使用后，我们可能按合理期限保留必要记录以履行安全与合规义务。
      </p>

      <h2>联系</h2>
      <p>如对隐私有疑问，请通过产品内账户相关入口或运营方公布的联系方式反馈。</p>
    </LegalPage>
  );
}
