import { getChatGPTUser, chatGPTSignInPath } from "./chatgpt-auth";
import { Library } from "./library";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getChatGPTUser();

  if (!user) {
    return (
      <main className="auth-shell">
        <p className="eyebrow">STORYYARD</p>
        <h1>플롯은 넓게 보고,<br />블록은 손으로 만진다.</h1>
        <p>노벨라식 작업 흐름을 개인용으로 정리한 웹소설 플롯 작업판.</p>
        <a className="primary-button" href={chatGPTSignInPath("/")}>ChatGPT로 들어가기</a>
      </main>
    );
  }

  return <Library userName={user.displayName} />;
}
