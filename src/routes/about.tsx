import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-page";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [{ title: "关于锋口 · 锋口" }],
  }),
  component: AboutPage,
});

function AboutPage() {
  return (
    <LegalPage title="关于锋口">
      <p>
        <strong>锋口</strong>是一款个人入场研判台：帮你维护股票与虚拟货币观察池，汇总公开行情与新闻，
        并结合模型给出多维分析，辅助判断是否适合现在开仓、大致仓位与主要风险。
      </p>

      <h2>我们做什么</h2>
      <p>
        观察池管理、买卖流水与浮动盈亏、总仓报表，以及对关注标的的新闻收集与结构化研判。
        每个账户独立保存自己的资料与仓位。
      </p>

      <h2>重要声明</h2>
      <p>
        <strong>本产品内容不构成任何投资建议，也不保证收益。</strong>
        行情与资讯可能延迟或不完整；模型输出仅供参考。请结合自身判断与风险承受能力独立决策。
      </p>

      <h2>联系与反馈</h2>
      <p>如需反馈产品问题或改进建议，请通过运营方公布的渠道联系我们。</p>
    </LegalPage>
  );
}
