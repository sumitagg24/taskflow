import { LegalLayout, LegalSection, LegalList } from './LegalLayout';

function ContactSupportLink() {
  return (
    <a href="/contact" className="underline underline-offset-4">
      Contact Support
    </a>
  );
}

export default function TermsOfServicePage() {
  return (
    <LegalLayout
      title="Terms of Service"
      intro="These Terms form the agreement between you and TaskFlow for your use of the TaskFlow web application. TaskFlow is an independent project. By creating an account or using the service, you agree to these Terms — if you do not agree, please do not use TaskFlow."
    >
      <LegalSection index="1" heading="The service">
        <p>
          TaskFlow is a free personal-productivity web application: tasks and subtasks, boards, a
          calendar, a focus timer, team workspaces, and an optional AI assistant that works with an
          API key you provide. The service is provided free of charge, without a service-level
          agreement, and may evolve over time as features are added or improved.
        </p>
      </LegalSection>

      <LegalSection index="2" heading="Eligibility and your account">
        <LegalList>
          <li>You must be at least 13 years old to use TaskFlow.</li>
          <li>
            Provide accurate registration information and keep it up to date — password resets,
            verification, and team invitations all depend on a working email address.
          </li>
          <li>
            Keep your password confidential. You are responsible for all activity under your
            account, so use a strong, unique password and tell us immediately at the contact email
            below if you suspect unauthorised access.
          </li>
          <li>One account per person, unless we agree otherwise in writing.</li>
        </LegalList>
      </LegalSection>

      <LegalSection index="3" heading="Acceptable use">
        <p>You agree not to:</p>
        <LegalList>
          <li>Break the law, or store or share unlawful, hateful, or infringing content.</li>
          <li>
            Attack the service: no unauthorised access attempts, scraping at abusive rates,
            denial-of-service, malware, or circumventing rate limits, lockouts, or access controls.
          </li>
          <li>Upload content that infringes anyone&apos;s intellectual-property or privacy rights.</li>
          <li>Send spam or abuse team invitations, or harass other users.</li>
          <li>Misrepresent the service, resell access to it, or use it to build a competing copy by systematic extraction.</li>
        </LegalList>
        <p>
          We may rate-limit, suspend, or terminate accounts that violate these Terms or threaten the
          security or usability of the service for others.
        </p>
      </LegalSection>

      <LegalSection index="4" heading="Your content">
        <LegalList>
          <li>
            <strong>You own your content.</strong> Everything you put into TaskFlow — tasks,
            comments, attachments, templates, workspace data — remains yours.
          </li>
          <li>
            <strong>Licence to operate the service.</strong> You grant TaskFlow a worldwide,
            non-exclusive, royalty-free licence to host, store, process, transmit, and display your
            content (including through the subprocessors listed in our Privacy Policy) solely to
            provide and improve the service for you. This licence ends when your content is deleted,
            subject to the retention described in the Privacy Policy.
          </li>
          <li>
            <strong>Shared workspaces.</strong> Content you add to a team workspace can be seen,
            edited, or deleted by the members you invite — invite only people you trust.
          </li>
          <li>
            <strong>Backups.</strong> Deleted tasks are restorable from Trash for 30 days and then
            permanently deleted. Keep your own copies of anything critical (for example via the
            calendar export).
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection index="5" heading="AI features">
        <LegalList>
          <li>
            The assistant runs on <em>your</em> API key with <em>your</em> chosen provider and
            settings, and is subject to that provider&apos;s terms and pricing in addition to ours.
          </li>
          <li>
            AI-generated responses can be wrong, incomplete, or biased. They are provided for
            general assistance only — not professional, legal, medical, or financial advice — and
            you should verify anything important independently.
          </li>
          <li>
            Do not submit confidential information you are not entitled to share, and do not use AI
            outputs in ways that violate applicable law or anyone&apos;s rights.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection index="6" heading="Third-party services">
        <p>
          Sign-in via Google, GitHub, or Auth0, and any AI provider you connect, are third-party
          services with their own terms and privacy policies. TaskFlow is not responsible for those
          services, and an outage or change on their side may affect related features here.
        </p>
      </LegalSection>

      <LegalSection index="7" heading="Availability and changes">
        <p>
          We aim to keep TaskFlow reliable, but the service is provided “as is” with no guaranteed
          uptime. Maintenance, provider outages, or changes beyond our control may cause temporary
          interruptions or loss of data. We may modify or discontinue features with reasonable
          notice in the app where practical.
        </p>
      </LegalSection>

      <LegalSection index="8" heading="Intellectual property">
        <p>
          The TaskFlow application, brand mark, and design are owned by the TaskFlow project and
          protected by applicable intellectual-property law. These Terms give you a personal,
          non-transferable right to use the service — not ownership of it, and no right to copy,
          modify, or reverse-engineer the application except as permitted by law.
        </p>
      </LegalSection>

      <LegalSection index="9" heading="Termination">
        <LegalList>
          <li>
            <strong>By you:</strong> stop using TaskFlow anytime. To permanently delete your account
            and personal data, send us a message through our <ContactSupportLink /> page
            from your account email address — we complete deletions within 30 days.
          </li>
          <li>
            <strong>By us:</strong> we may suspend or terminate accounts that breach these Terms or
            endanger the service, with notice where practical.
          </li>
          <li>
            On termination your right to use the service ends immediately; §§4 (for deleted
            content, subject to retention), 8, and 10–13 survive.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection index="10" heading="Disclaimers and limitation of liability">
        <p>
          To the maximum extent permitted by law, TaskFlow is provided “as is” and “as available”,
          without warranties of any kind — express, implied, or statutory — including merchantability,
          fitness for a particular purpose, and non-infringement.
        </p>
        <p>
          To the maximum extent permitted by law, TaskFlow shall not be liable for any indirect,
          incidental, special, consequential, or punitive damages, or any loss of data, profits, or
          goodwill, arising from your use of (or inability to use) the service. Our total liability
          for any claim is limited to the amounts you paid for the service in the 12 months before
          the claim — TaskFlow being free of charge, this means no monetary liability beyond what
          the law mandatorily requires.
        </p>
      </LegalSection>

      <LegalSection index="11" heading="Indemnity">
        <p>
          You agree to indemnify TaskFlow against claims, damages, and reasonable costs arising from
          your content or your breach of these Terms, to the extent permitted by law.
        </p>
      </LegalSection>

      <LegalSection index="12" heading="Changes to these Terms">
        <p>
          We may update these Terms as the service evolves. Material changes will be announced in
          the app or by email before taking effect, with the “Last updated” date revised. Continued
          use after the effective date constitutes acceptance; if you disagree, stop using TaskFlow
          and request account deletion under §9.
        </p>
      </LegalSection>

      <LegalSection index="13" heading="Governing law and disputes">
        <p>
          If something goes wrong, talk to us first: send us a message through our{' '}
          <ContactSupportLink /> page describing the issue, and we will attempt to resolve
          it in good faith within 30 days.
          These Terms are otherwise governed by the laws of India, and subject to that first step,
          disputes fall under the jurisdiction of the competent courts of India. If any provision is
          found unenforceable, the remainder continues in full effect.
        </p>
      </LegalSection>

      <LegalSection index="14" heading="Contact">
        <p>
          TaskFlow — reach us anytime through our <ContactSupportLink /> page.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
