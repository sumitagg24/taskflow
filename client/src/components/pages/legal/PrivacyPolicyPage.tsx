import { LegalLayout, LegalSection, LegalList, SUPPORT_EMAIL } from './LegalLayout';

export default function PrivacyPolicyPage() {
  return (
    <LegalLayout
      title="Privacy Policy"
      intro="This Privacy Policy explains what information TaskFlow collects, how it is used, and the choices you have. TaskFlow is an independent project (“we”, “us”, “our”). If you have any question about this policy, contact us at the email address below — we read every message."
    >
      <LegalSection index="1" heading="The service in brief">
        <p>
          TaskFlow is a free task-management web application: tasks and subtasks, boards, a
          calendar, a focus timer, team workspaces, and an optional AI assistant. There is no
          advertising in TaskFlow, and <strong>we do not sell your personal information</strong> —
          not to advertisers, data brokers, or anyone else.
        </p>
      </LegalSection>

      <LegalSection index="2" heading="Information we collect">
        <p className="font-medium text-gray-900 dark:text-gray-100">2.1 — Information you give us</p>
        <LegalList>
          <li>
            <strong>Account details:</strong> name, username, and email address when you register.
            If you sign up with email and password, we store only a salted cryptographic hash of
            your password (bcrypt) — never the password itself.
          </li>
          <li>
            <strong>Profile details you add (optional):</strong> avatar and bio.
          </li>
          <li>
            <strong>Your content:</strong> tasks, subtasks, comments, file attachments, categories,
            templates, favorites, focus-timer statistics, and app preferences such as theme,
            notification settings, and pomodoro durations.
          </li>
          <li>
            <strong>Team data:</strong> workspaces you create and the email addresses of people you
            invite to them.
          </li>
          <li>
            <strong>Support messages</strong> you send us by email.
          </li>
        </LegalList>

        <p className="font-medium text-gray-900 dark:text-gray-100">2.2 — Information from sign-in providers</p>
        <p>
          When you sign in with Google, GitHub, or Auth0, that provider shares your basic profile
          with us — typically your name, email address, profile photo, and provider user ID — so we
          can create and recognise your account. We never receive or store your provider password.
          Each provider&apos;s handling of your data is governed by its own privacy policy
          (see §10).
        </p>

        <p className="font-medium text-gray-900 dark:text-gray-100">2.3 — AI features (optional, bring your own key)</p>
        <p>
          The AI assistant only works if you connect it to an AI provider with <em>your own</em>{' '}
          API key (supported providers include OpenAI, Google Gemini, Anthropic, Groq, OpenRouter,
          Together AI, or any OpenAI-compatible endpoint). We store your chosen provider, model,
          settings, and API key — the key is stored encrypted and is never displayed back to you in
          full. Content you submit to the assistant is transmitted to your chosen provider to
          generate a response, and is subject to that provider&apos;s own privacy policy. Nothing is
          sent to any AI provider unless you use the feature.
        </p>

        <p className="font-medium text-gray-900 dark:text-gray-100">2.4 — Information collected automatically</p>
        <LegalList>
          <li>
            <strong>Diagnostic server logs</strong> (IP address, browser type, request metadata)
            kept for a limited time for security monitoring and debugging.
          </li>
          <li>
            <strong>Login-security signals</strong> such as failed-attempt counters and temporary
            account lockouts to block brute-force attacks.
          </li>
          <li>
            <strong>Aggregate usage counters</strong> (for example AI-assistant usage counts) used to
            enforce fair-use limits.
          </li>
        </LegalList>

        <p className="font-medium text-gray-900 dark:text-gray-100">2.5 — Information stored on your device</p>
        <p>
          TaskFlow keeps login session tokens, offline task drafts, your theme choice, and small
          onboarding flags in your browser&apos;s cookies and local storage so the app works and can
          recover drafts without a connection. Clearing your browser storage will sign you out and
          discard unsynced drafts.
        </p>
      </LegalSection>

      <LegalSection index="3" heading="How we use your information">
        <LegalList>
          <li>To create and secure your account and keep you signed in.</li>
          <li>To store, sync, and display your tasks and workspace content across your devices.</li>
          <li>
            To send essential account emails (email verification, password resets, team
            invitations) and — only if you keep them enabled in Settings — notification emails.
          </li>
          <li>To protect the service: prevent abuse, enforce rate limits, and debug errors.</li>
          <li>To provide AI responses, only when you explicitly use the AI assistant.</li>
          <li>To respond to your support requests.</li>
          <li>To comply with legal obligations.</li>
        </LegalList>
      </LegalSection>

      <LegalSection index="4" heading="Who we share it with">
        <p>
          We share information only with the service providers needed to run TaskFlow, each limited
          to its own job:
        </p>
        <LegalList>
          <li>Auth0 — identity and sign-in infrastructure.</li>
          <li>Google and GitHub — only to complete the social sign-in you choose.</li>
          <li>Vercel — hosts the web application; Railway — hosts the API.</li>
          <li>A managed MongoDB database and S3-compatible object storage for attachments.</li>
          <li>Transactional email delivery (SMTP / Resend) for verification, reset, invitation, and notification emails.</li>
          <li>The AI provider you personally connect — and only content you submit to the assistant.</li>
        </LegalList>
        <p>
          Content you place in a shared team workspace is visible to the members you invite. Beyond
          the above, we disclose information only when required by law or to protect the safety,
          rights, or property of our users and the service. We do not share data for third-party
          advertising or marketing.
        </p>
      </LegalSection>

      <LegalSection index="5" heading="International transfers">
        <p>
          Our hosting and service providers operate in the United States, the European Union, and
          other regions, so your information may be processed outside your own country. Where this
          happens it is covered by the providers&apos; contractual safeguards.
        </p>
      </LegalSection>

      <LegalSection index="6" heading="How long we keep it">
        <LegalList>
          <li>
            <strong>Account and content data</strong> is kept while your account is active.
          </li>
          <li>
            <strong>Trash:</strong> deleted tasks stay restorable for 30 days and are then
            permanently and automatically deleted, along with their associated timer sessions.
          </li>
          <li>
            <strong>Verification and password-reset tokens</strong> are single-use, stored hashed,
            and expire within minutes to hours.
          </li>
          <li>
            If you ask us to delete your account (see §8), we complete the deletion within 30 days.
            Residual copies may persist in backups for a limited period before expiring naturally.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection index="7" heading="Security">
        <LegalList>
          <li>Passwords are stored only as salted bcrypt hashes — never in readable form.</li>
          <li>All traffic between your browser and TaskFlow is encrypted with TLS (HTTPS).</li>
          <li>Third-party AI API keys you save are encrypted at rest and never shown in full again.</li>
          <li>Password-reset and verification tokens are single-use, hashed, and short-lived.</li>
          <li>Rate limiting and temporary lockouts guard sign-in and sensitive endpoints.</li>
          <li>Technical access controls ensure an account can only read and modify its own data.</li>
        </LegalList>
        <p>
          No system is perfectly secure. Please use a strong, unique password and keep your devices
          and recovery email secure — and tell us immediately if you suspect unauthorised access.
        </p>
      </LegalSection>

      <LegalSection index="8" heading="Your rights and choices">
        <LegalList>
          <li>
            <strong>Access, correction, and deletion:</strong> email{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="underline underline-offset-4">
              {SUPPORT_EMAIL}
            </a>{' '}
            from your account email address and we will action your request within 30 days,
            including permanently deleting your account and personal data.
          </li>
          <li>
            <strong>A copy of your data:</strong> request an export of the personal data we hold
            about you at the same address.
          </li>
          <li>
            <strong>Notification emails:</strong> toggle them anytime in Settings → Notifications.
            Essential account emails (verification, password reset, security notices) cannot be
            disabled while you hold an account.
          </li>
          <li>
            <strong>AI features:</strong> remove your API key in Settings → AI to stop all
            AI-provider processing immediately.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection index="9" heading="Children">
        <p>
          TaskFlow is not directed at children under 13, and we do not knowingly collect their
          data. If you believe a child has provided us personal information, contact us and we will
          delete it promptly.
        </p>
      </LegalSection>

      <LegalSection index="10" heading="Third-party privacy policies">
        <p>
          When you sign in through a provider, that provider&apos;s policy also applies:
        </p>
        <LegalList>
          <li>
            Google —{' '}
            <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
              policies.google.com/privacy
            </a>
          </li>
          <li>
            GitHub —{' '}
            <a href="https://docs.github.com/en/site-policy/privacy-policies/github-privacy-statement" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
              GitHub Privacy Statement
            </a>
          </li>
          <li>
            Auth0 (Okta) —{' '}
            <a href="https://www.auth0.com/privacy" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
              auth0.com/privacy
            </a>
          </li>
        </LegalList>
        <p>
          If you connect the AI assistant, your chosen AI provider&apos;s privacy policy applies to
          the content you submit to it.
        </p>
      </LegalSection>

      <LegalSection index="11" heading="Changes to this policy">
        <p>
          If we change this policy we will post the new version here with a new “Last updated”
          date, and for material changes we will additionally notify you in the app or by email
          before they take effect. Continued use of TaskFlow after a change means you accept the
          updated policy.
        </p>
      </LegalSection>

      <LegalSection index="12" heading="Contact us">
        <p>
          TaskFlow —{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="underline underline-offset-4">
            {SUPPORT_EMAIL}
          </a>
          . We aim to answer privacy requests within 30 days.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
