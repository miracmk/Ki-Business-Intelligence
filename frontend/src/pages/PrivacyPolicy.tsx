import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

const SECTIONS: { title: string; body: (string | { sub: string; items: string[] })[] }[] = [
  {
    title: '1. Introduction and Scope',
    body: [
      'Ki Business Solutions ("we," "our," "us") operates KiBI, a multi-channel e-commerce business intelligence (BI) and enterprise resource planning (ERP) Software-as-a-Service (SaaS) platform designed to streamline operations, profitability analysis, and invoicing for global digital merchants.',
      'This Privacy Policy explains how we collect, process, store, transfer, and delete data when you use our website, client portals, and SaaS services (collectively, "the Platform").',
      {
        sub: '1.1 Special Supplement for Amazon Selling Partner API (SP-API)',
        items: [
          'This policy contains specialized sections explicitly aligned with the Amazon Selling Partner API Data Protection Policy (DPP), Acceptable Use Policy (AUP), and Amazon Services API Developer Agreement. These provisions govern all "Amazon Information" (which includes any data, metadata, or personally identifiable information retrieved, processed, or vended through the Amazon SP-API). All systems, databases, network zones, and processes within KiBI that interact with Amazon Selling Partner APIs are strictly bound to the safeguards detailed herein.',
        ],
      },
    ],
  },
  {
    title: '2. Information We Collect',
    body: [
      {
        sub: '2.1 Information Collected Automatically',
        items: [
          'Internet Protocol (IP) addresses and approximate geolocation.',
          'Browser configurations, system OS, and hardware parameters.',
          'Referrer URLs and detailed interaction logs (timestamps, page-views, clickstream analysis).',
          'Essential, analytical, and functional cookies (subject to user consent settings).',
        ],
      },
      {
        sub: '2.2 Information Provided Directly by Platform Users',
        items: [
          'Identity Data: Full name, corporate email address, phone numbers, and company registration details.',
          'Financial & Accounting Data: Business bank account details, payment gateways, e-invoice identifiers, and transaction metadata.',
          'System Credentials: OAuth authorization codes, encrypted API integration keys (where authorized by the user).',
        ],
      },
      {
        sub: '2.3 Information Ingested via E-Commerce Integrations (Including Amazon SP-API)',
        items: [
          'Non-Personally Identifiable Information (Non-PII): Product catalog listings, ASINs, stock levels, sales prices, historical sales velocity, cost of goods sold (COGS), promotional costs, and settlement reports (e.g., Amazon referral fees, FBA storage fees, and advertising costs).',
          "Personally Identifiable Information (PII) / Restricted Data: Under authorized roles such as Tax Invoicing and Finances, we ingest transactional billing and delivery identifiers. This includes the buyer's legal name, billing address (street, city, state/province, postal code, country), and corporate tax registration numbers (e.g., VAT, Tax ID, or localized TCKN/VKN for Turkish Revenue Administration / GİB compliance).",
        ],
      },
    ],
  },
  {
    title: '3. Permitted Uses of Information (AUP Compliance)',
    body: [
      'We process your data strictly under valid legal bases (Contractual Necessity, Legal Obligation, and Legitimate Business Interest).',
      'For Amazon Information, processing is governed by strict Acceptable Use Policy (AUP) standards. We will only use Amazon Information for the following explicit, authorized operational purposes:',
      {
        sub: '',
        items: [
          'Financial Analytics & Profitability Engine: Consolidating real-time seller metrics to calculate net profit margins, organic-to-advertising attribution, and inventory turnover ratios.',
          'Multi-Marketplace Synchronization: Tracking inventory levels across various integration nodes to prevent inventory depletion, stockouts, or double-selling.',
          'Automated Regulatory Tax Invoicing: Consolidating sales data to generate legally compliant tax invoices (e-Fatura/e-Arşiv in Turkey, EU VAT/OSS declarations, and regional Sales Tax records) and delivering these invoices to government-authorized portals and the end-buyer.',
        ],
      },
      {
        sub: '3.1 Prohibited Use Cases',
        items: [
          'KiBI guarantees that Amazon Information and customer PII will never be sold, rented, leased, or bartered to any third-party marketing networks, data brokers, or external entities.',
          'Never used for targeted behavioral advertising, consumer profiling, or cross-site tracking.',
          'Never utilized to build cold-outreach mailing lists, customer marketing campaigns, or unsolicited promotional flows.',
          "Never processed for competitive intelligence, product sourcing analytics, or pricing manipulation against the seller's interests.",
        ],
      },
    ],
  },
  {
    title: '4. Strict Data Retention and Disposing of PII',
    body: [
      {
        sub: '4.1 The 30-Day Mandatory Deletion Rule',
        items: [
          "In absolute compliance with Section 2.1 of the Amazon Selling Partner API Data Protection Policy (DPP), KiBI does not retain Personally Identifiable Information (PII) of Amazon buyers indefinitely.",
          'Maximum Operational Retention: All Amazon buyer PII is permanently and securely deleted, purged, or fully anonymized within 30 days of order shipment or delivery.',
          "Execution: Post the 30-day fulfillment limit, active transactional tables in KiBI's production databases are automatically scrubbed of buyer names, specific billing street addresses, and contact numbers.",
          'Preserved Analytical Data: Non-PII parameters (order ID, state/province, country, postal code, total purchase amount, tax collected, and ASINs) are retained up to 18 months for financial reporting, BI dashboard population, and trend analysis.',
        ],
      },
      {
        sub: '4.2 Regulatory and Tax Compliance Exceptions',
        items: [
          'Under localized tax regulations (such as the Turkish Tax Procedure Law No. 213, EU VAT directives, or HMRC rules), merchants are legally required to archive commercial tax invoices (containing buyer billing names and addresses) for structural audits (e.g., 5 to 10 years depending on jurisdiction).',
          "To comply with both Amazon's DPP and local laws, KiBI isolates finalized official invoices.",
          'These documents are extracted from active production layers and placed in heavily restricted, geographically separated, encrypted cold storage.',
          'This cold archive is entirely sealed from the operational application layer and can only be accessed through explicit manual compliance overrides during regulatory tax audits.',
        ],
      },
      {
        sub: '4.3 Data Sanitization Standard',
        items: [
          'All data deletion, whether triggered by the 30-day policy, user account closure, or an Amazon-issued deletion notice, is executed in accordance with NIST SP 800-88 Revision 1 (Guidelines for Media Sanitization). This ensures that data cannot be reconstructed or recovered from physical or logical storage media. Anonymization is never used as a substitute for permanent deletion when physical purging is requested.',
        ],
      },
    ],
  },
  {
    title: '5. Robust Security Controls (DPP Alignment)',
    body: [
      'KiBI implements industry-leading physical, technical, and administrative safeguards to protect data from unauthorized access, modification, disclosure, or destruction.',
      {
        sub: '5.1 Infrastructure and Network Security (DPP Section 1.1)',
        items: [
          'Network Segmentation: Our production environment is deployed within isolated Virtual Private Clouds (VPCs). Database engines and file systems housing Amazon Information are located in private subnets with no public IP routing.',
          'Public Access Blocks: Access to raw database instances from the public internet is completely blocked. Public-facing web traffic is securely routed through Web Application Firewalls (WAF) to block Layer 7 application exploits.',
          'Intrusion Detection/Prevention (IDS/IPS): Active monitoring systems detect anomalous network behaviors, distributed denial-of-service (DDoS) threats, and signature-based scanning patterns.',
          'Endpoint Integrity: All employee work devices run enterprise-grade anti-malware and anti-virus suites with centralized status reporting. Removable media (such as USB flash drives) are blocked at the administrative system level.',
        ],
      },
      {
        sub: '5.2 Access Management & Identity Control (DPP Section 1.2)',
        items: [
          'No Shared Credentials: Every team member, developer, or administrator is assigned a unique, immutable corporate identity credential. Shared, default, or generic accounts are strictly prohibited.',
          'Multi-Factor Authentication (MFA): MFA is structurally enforced across all systems, staging environments, production deployment servers, AWS portals, and administrative tools.',
          'Strict Password Policies: Minimum length of twelve (12) characters; uppercase, lowercase, numbers, and special symbols required; mandatory rotation every 90 days; history tracking prevents reuse of the last 10 passwords; account lockout after five (5) failed authentication attempts.',
          'Quarterly Reviews: The list of approved personnel with logical access to Amazon Information is audited and reviewed every 90 days. Permissions are revoked immediately (and within 24 hours of employee departure) on a strict "need-to-know" basis.',
        ],
      },
      {
        sub: '5.3 Cryptographic Protections (DPP Section 1.5 & 2.4)',
        items: [
          'Encryption In-Transit: All data moving between client web browsers, our API servers, and external third-party endpoints is encrypted using Transport Layer Security (TLS 1.3 / TLS 1.2) using strong, non-deprecated cipher suites. Unencrypted communication paths are blocked.',
          'Encryption At-Rest: All Amazon Information and PII stored in databases, log streams, cloud-native storage buckets, and backups is encrypted using AES-256 or RSA-4096 for cryptographic keys.',
          'Key Management System (KMS): Cryptographic keys are stored and rotated using cloud-managed Key Management Services (KMS) that enforce logical access separation, granular execution policies, and complete access logging.',
        ],
      },
      {
        sub: '5.4 Secure SDLC and Vulnerability Management',
        items: [
          'Code Auditing: All code changes are evaluated in dedicated, isolated staging environments. No production data is ever used in testing; we employ anonymized mock datasets.',
          'Vulnerability Scanning: Automated vulnerability scans of our network, system libraries, and application packages are executed every 30 days.',
          'Penetration Testing: Independent, certified third-party security firms conduct grey-box penetration testing on our systems annually.',
          'Remediation SLA: Critical vulnerabilities are patched within 7 days of discovery; high-risk vulnerabilities within 30 days.',
        ],
      },
    ],
  },
  {
    title: '6. Incident Response and Breach Notification (DPP Section 2.6)',
    body: [
      'KiBI maintains a documented, active Incident Response Plan (IRP) designed to detect, isolate, and remediate cybersecurity threats, unauthorized disclosures, or infrastructure compromises. The plan is tested and updated at least once every six months.',
      {
        sub: '6.1 Strict Amazon Notification SLA',
        items: [
          'In the event of an actual, suspected, or threatened security incident resulting in unauthorized access to, exposure of, or alteration of Amazon Information, KiBI commits to:',
          'Immediate Containment: Isolating affected servers, revoking compromised authentication credentials, and blocking further data leakages.',
          'Notification: Reporting the detailed scope, estimated impact, and remediation plan of the security incident to Amazon Security via email at security@amazon.com within twenty-four (24) hours of initial detection.',
          "Cooperation: Fully collaborating with Amazon's security investigators, providing forensic logs (retained securely for at least 12 months), and implementing necessary corrective actions.",
        ],
      },
    ],
  },
  {
    title: '7. Third-Party Data Sharing',
    body: [
      'Except as outlined below, KiBI does not share Amazon Information or client operational data with any outside parties.',
      {
        sub: '7.1 Authorized Compliance Outlets',
        items: [
          'Where explicitly configured and authorized by the platform user, encrypted order transaction data may be transmitted to official, government-authorized electronic invoicing integrators (e.g., EDM, İzibiz, or local European tax compliance nodes) solely for the technical execution, registration, and issuance of official tax invoices.',
          'These transmissions occur over secure API connections utilizing TLS 1.3, and the third parties are contractually bound to the same data security and privacy standards outlined in this policy.',
        ],
      },
    ],
  },
  {
    title: '8. User Rights and Data Portability',
    body: [
      'Under modern data privacy frameworks (including GDPR, KVKK, and CCPA), platform users and their buyers possess fundamental rights regarding their personal data:',
      {
        sub: '',
        items: [
          'Right of Access: Request a copy of the personal information stored in our system.',
          'Right to Rectification: Request corrections to inaccurate, incomplete, or outdated information.',
          'Right to Erasure ("Right to be Forgotten"): Request the permanent deletion of personal data (subject to localized statutory retention periods).',
          'Right to Restriction of Processing: Limit the ways we process personal data.',
          'Right to Data Portability: Request data export in a structured, commonly used, machine-readable format.',
        ],
      },
      'To exercise these rights, please contact our Data Protection Officer at privacy@kibusiness.co. We will respond to and address all verifiable requests within 30 days.',
    ],
  },
  {
    title: '9. Regulatory Contacts and IMPOC',
    body: [
      'For inquiries regarding this Privacy Policy, our security postures, or to report a suspected security vulnerability, please contact our Incident Management Point of Contact (IMPOC) and Data Protection Officer (DPO):',
      {
        sub: '',
        items: [
          'Incident Management Point of Contact (IMPOC): Miraç Murat Kılınç',
          'Primary Security Email: privacy@kibusiness.co',
          'General Inquiries: info@kibusiness.co',
          'Corporate Address: Üçevler Mah Ertuğrul Cad No:87, 16120, Nilüfer, Bursa, Turkey',
        ],
      },
    ],
  },
]

export default function PrivacyPolicy() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)', color: 'var(--text-1)' }}>
      <header className="py-5 px-6" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-sm font-medium"
            style={{ color: 'var(--text-2)' }}
          >
            <ArrowLeft size={16} /> Ana Sayfa
          </button>
          <div className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold text-xs"
              style={{ background: 'linear-gradient(135deg, var(--accent), var(--forest))' }}
            >K</div>
            <span className="font-semibold text-sm" style={{ color: 'var(--text-2)' }}>Ki Business Intelligence</span>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold mb-2">KiBI SaaS Platform — Comprehensive Privacy Policy &amp; Amazon SP-API Data Protection Compliance Supplement</h1>
        <p className="text-sm mb-1" style={{ color: 'var(--text-3)' }}>Last Updated: June 26, 2026 · Effective Date: June 26, 2026</p>
        <p className="text-sm mb-1" style={{ color: 'var(--text-3)' }}>
          Publisher: Ki Business Solutions (<a href="https://kibusiness.co" className="hover:text-[var(--accent)]">kibusiness.co</a>)
        </p>
        <p className="text-sm mb-10" style={{ color: 'var(--text-3)' }}>
          Security Contact: <a href="mailto:privacy@kibusiness.co" className="hover:text-[var(--accent)]">privacy@kibusiness.co</a>
        </p>

        {SECTIONS.map((section) => (
          <section key={section.title} className="mb-9">
            <h2 className="text-xl font-semibold mb-3">{section.title}</h2>
            {section.body.map((block, i) =>
              typeof block === 'string' ? (
                <p key={i} className="text-sm leading-relaxed mb-3" style={{ color: 'var(--text-2)' }}>
                  {block}
                </p>
              ) : (
                <div key={i} className="mb-3">
                  {block.sub && <h3 className="text-base font-medium mb-2">{block.sub}</h3>}
                  <ul className="list-disc pl-5 space-y-1.5">
                    {block.items.map((item, j) => (
                      <li key={j} className="text-sm leading-relaxed" style={{ color: 'var(--text-2)' }}>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )
            )}
          </section>
        ))}
      </main>

      <footer className="py-10 px-6" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="max-w-3xl mx-auto flex items-center justify-between text-xs" style={{ color: 'var(--text-3)' }}>
          <span>© 2026 Ki Business Intelligence</span>
          <a href="mailto:privacy@kibusiness.co" className="hover:text-[var(--accent)] transition-colors">
            privacy@kibusiness.co
          </a>
        </div>
      </footer>
    </div>
  )
}
