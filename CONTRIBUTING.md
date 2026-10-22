# Contributing to Lunaria 🌙

Thank you for being here. Every bug report, typo fix and "this feels off" note makes Lunaria a little better. 💜

## 🧭 Ground rules

- **Be kind.** Assume good intent. Everyone here likes reading, which is a solid foundation for a friendly community.
- **Small PRs beat giant ones.** One idea per pull request.
- **Big change? Open an issue first.** We'd rather talk before you write 2,000 lines nobody asked for.

## 🛠️ Getting set up

1. Fork the repository and clone your fork.
2. Use **Node 22**.
3. `npm install`
4. `npm run dev`, open the URL it prints, drop an `.epub` into the library and start reading. That is the whole onboarding. 🎉

## ✅ Before you open a PR

```bash
npm run typecheck              # TypeScript, strict mode
npm test                       # unit tests (Vitest)
npm run build && npm run e2e   # browser tests (Playwright, mobile and desktop)
```

If Playwright complains about browsers, run `npx playwright install chromium`.

## 🎨 Style

- Formatting follows `.prettierrc`: single quotes, no semicolons, 180-column lines.
- TypeScript strict mode stays on. Avoid `any`, or leave a comment explaining why it's there.
- Comments explain *why*, not *what*. The existing code comments are in Spanish; English comments in new code are welcome.
- New behaviour comes with a test. Bug fix? Write the failing test first, then the fix. 🧪

## 💬 Commits and pull requests

- Subject line in the imperative mood, under ~72 characters.
- The body explains the *why*.
- The PR description says how you tested it. Screenshots for UI changes are pure gold. 🏆

## 🌱 Good first contributions

- Open an EPUB that breaks the reader and report it (or add it as a test fixture).
- Find a button without an accessible label and fix it.
- Help with an English UI: the app is Spanish-only today, so the strings are a great place to start.
- Spot something confusing in the docs? Fix it. Docs PRs are real contributions.

## 🙌 Code of conduct

Be the reviewer you'd want to get. Harassment, gatekeeping and drive-by insults get you removed, no discussion.
