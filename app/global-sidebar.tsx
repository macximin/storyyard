"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  BookOpen,
  BookmarkSimple,
  Eye,
  EyeSlash,
  GearSix,
  House,
  SignOut,
  Star,
  UserCircle,
} from "@phosphor-icons/react";
import { FormEvent, useState } from "react";

export type SidebarUser = {
  id: string;
  username: string;
  displayName: string;
  role: "admin" | "user";
} | null;

export function GlobalSidebar({
  user,
  active,
  setupRequired = false,
}: {
  user: SidebarUser;
  active: "community" | "preferred" | "studio" | "studio-favorites" | "admin";
  setupRequired?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<"login" | "register">(setupRequired ? "register" : "login");
  const [authOpen, setAuthOpen] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: form.get("username"),
        password: form.get("password"),
        displayName: form.get("displayName"),
        setupCode: form.get("setupCode"),
        remember: form.get("remember") === "on",
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "처리하지 못했음.");
      setPending(false);
      return;
    }
    const returnTo = searchParams.get("return_to");
    if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) {
      router.push(returnTo);
    } else {
      router.refresh();
    }
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <aside className="global-sidebar">
      <Link className="wordmark" href="/">STORYYARD</Link>
      {user ? (
        <div className="signed-user">
          <div className="user-chip">
            <span>{user.displayName.slice(0, 1)}</span>
            <div><strong>{user.displayName}</strong><small>@{user.username}</small></div>
          </div>
          <button className="sidebar-signout" type="button" onClick={signOut} aria-label="로그아웃">
            <SignOut size={17} />
          </button>
        </div>
      ) : (
        <>
        <button
          className="mobile-auth-button"
          type="button"
          aria-label={authOpen ? "계정 창 닫기" : "로그인 및 회원가입"}
          aria-expanded={authOpen}
          onClick={() => setAuthOpen((value) => !value)}
        >
          <UserCircle size={19} /><span>로그인</span>
        </button>
        <form className={`embedded-auth ${authOpen ? "mobile-open" : ""}`} onSubmit={submit}>
          <div className="auth-tabs" role="tablist" aria-label="계정">
            <button type="button" className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>로그인</button>
            <button type="button" className={mode === "register" ? "active" : ""} onClick={() => setMode("register")}>회원가입</button>
          </div>
          {mode === "register" && (
            <input name="displayName" placeholder="표시 이름" maxLength={32} />
          )}
          <input name="username" placeholder="아이디" autoComplete="username" required />
          <label className="password-input">
            <input
              name="password"
              type={passwordVisible ? "text" : "password"}
              placeholder="비밀번호"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              minLength={8}
              required
            />
            <button type="button" onClick={() => setPasswordVisible((value) => !value)} aria-label={passwordVisible ? "비밀번호 숨기기" : "비밀번호 보기"}>
              {passwordVisible ? <EyeSlash size={18} /> : <Eye size={18} />}
            </button>
          </label>
          {setupRequired && mode === "register" && (
            <input name="setupCode" placeholder="관리자 초기 설정 코드" required />
          )}
          <label className="remember-login">
            <input name="remember" type="checkbox" defaultChecked />
            <span>이 컴퓨터에서 로그인 유지</span>
          </label>
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="auth-submit" disabled={pending}>
            {pending ? "처리 중…" : mode === "login" ? "들어가기" : setupRequired ? "관리자 계정 만들기" : "가입하기"}
          </button>
          <p className="auth-safety">비밀번호는 저장하지 않고 암호화된 값만 보관함.</p>
        </form>
        </>
      )}

      <nav className="global-nav" aria-label="주 메뉴">
        <p>커뮤니티</p>
        <Link className={active === "community" ? "active" : ""} href="/" aria-label="전체장르">
          <BookOpen size={18} /><span>전체장르</span>
        </Link>
        <Link className={active === "preferred" ? "active" : ""} href="/preferred" aria-label="선호작">
          <BookmarkSimple size={18} /><span>선호작</span>
        </Link>
        <p>개인 작업실</p>
        <Link className={active === "studio" ? "active" : ""} href="/studio" aria-label="내 작품">
          <House size={18} /><span>내 작품</span>
        </Link>
        <Link className={active === "studio-favorites" ? "active" : ""} href="/studio?filter=favorites" aria-label="즐겨찾기">
          <Star size={18} /><span>즐겨찾기</span>
        </Link>
        {user?.role === "admin" && (
          <>
            <p>관리자</p>
            <Link className={active === "admin" ? "active" : ""} href="/admin" aria-label="운영 관리">
              <GearSix size={18} /><span>운영 관리</span>
            </Link>
          </>
        )}
      </nav>
      {!user && (
        <div className="guest-note"><UserCircle size={20} /><span>열람은 자유. 평가·댓글·출품은 로그인 후 가능.</span></div>
      )}
    </aside>
  );
}
