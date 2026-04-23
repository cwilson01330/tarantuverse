'use client'

import Link from 'next/link'

// Herpetoverse Terms of Service
// Operated by the same LLC as Tarantuverse (Appalachian Tarantulas, LLC, Tennessee).
// Placed at /herpetoverse/* until Sprint 1 decides the brand-split architecture
// (subdomain vs path vs separate Vercel project). Internal links are prefixed
// /herpetoverse/... for now — easy find/replace when the split lands.
//
// Logo: Herpetoverse brand identity (Q3) is still open. Using a text wordmark
// with a snake glyph placeholder. Swap in a real logo component once designed.
export default function HerpetoverseTermsPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-900">
      {/* Navigation — green/earth palette to distinguish from Tarantuverse purple/pink */}
      <nav className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-md shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <Link href="/herpetoverse" className="flex items-center gap-2">
              <span className="text-3xl" aria-hidden="true">🐍</span>
              <span className="text-2xl font-bold bg-gradient-to-r from-emerald-600 to-amber-700 bg-clip-text text-transparent">
                Herpetoverse
              </span>
            </Link>
            <div className="flex gap-3">
              <Link href="/herpetoverse/login" className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:text-emerald-600 dark:hover:text-emerald-400 font-medium transition">
                Login
              </Link>
              <Link href="/herpetoverse/register" className="px-6 py-2 bg-gradient-to-r from-emerald-600 to-amber-700 text-white rounded-lg hover:shadow-lg transform hover:scale-105 transition font-medium">
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-4xl font-bold mb-2 text-gray-900 dark:text-white">Terms of Service</h1>
        <p className="text-gray-600 dark:text-gray-400 mb-8">
          <strong>Last Updated:</strong> April 21, 2026 &nbsp;·&nbsp; <strong>Effective:</strong> upon public launch of Herpetoverse
        </p>

        <div className="prose prose-lg dark:prose-invert max-w-none">
          <section className="mb-8">
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              Welcome to Herpetoverse. These Terms of Service (the &ldquo;Terms&rdquo;) form a binding agreement between you and <strong>Appalachian Tarantulas, LLC</strong>, a Tennessee limited liability company (&ldquo;Appalachian Tarantulas,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;), and govern your access to and use of the Herpetoverse website, mobile applications, and related services (collectively, the &ldquo;Service&rdquo;). Please read these Terms carefully. By creating an account or otherwise using the Service, you agree to be bound by these Terms and by our <Link href="/herpetoverse/privacy-policy" className="text-emerald-600 dark:text-emerald-400 hover:underline">Privacy Policy</Link>.
            </p>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              Herpetoverse is a sibling platform to Tarantuverse. Both are operated by Appalachian Tarantulas, LLC. Your Herpetoverse account, when linked, is governed by these Terms for your use of Herpetoverse; your use of Tarantuverse remains governed by the <a href="https://tarantuverse.com/terms" className="text-emerald-600 dark:text-emerald-400 hover:underline">Tarantuverse Terms of Service</a>.
            </p>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              <strong>Please read Section 14 (Limitation of Liability) and Section 17 (Governing Law; Dispute Resolution) carefully. They limit our liability to you and specify how disputes must be resolved.</strong>
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">1. Eligibility</h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              You must be at least 13 years old to create an account. If you are between 13 and the age of majority in your jurisdiction, you may only use the Service with the involvement and consent of a parent or legal guardian who agrees to these Terms on your behalf. The Service is not directed to children under 13, and we do not knowingly collect personal information from children under 13. If you believe a child under 13 has created an account, please contact us at <a href="mailto:support@tarantuverse.com" className="text-emerald-600 dark:text-emerald-400 hover:underline">support@tarantuverse.com</a> so we can remove it.
            </p>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              By using the Service, you represent and warrant that (a) you meet the age requirement above, (b) you have the legal capacity to enter into these Terms, and (c) your use of the Service will comply with all applicable laws and regulations, including any laws governing the keeping, transport, import, export, and sale of reptiles and amphibians in your jurisdiction.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">2. The Service</h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              Herpetoverse is a husbandry-tracking and community platform for keepers of snakes, lizards, and other reptiles and amphibians (collectively, &ldquo;herpetofauna&rdquo;). It lets you record information about animals in your care (feeding, sheds, weights, breeding, photos, and similar records), browse species care information, use tools such as the welfare-aware morph calculator, and participate in community features including forums, profiles, follows, direct messages, and activity feeds. We may add, modify, or remove features at any time.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">3. Accounts and Account Security</h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              You must register for an account to use most features of the Service. You agree to provide accurate information, to keep it up to date, and to keep your login credentials confidential. You are responsible for all activity that occurs under your account. You must notify us promptly at <a href="mailto:support@tarantuverse.com" className="text-emerald-600 dark:text-emerald-400 hover:underline">support@tarantuverse.com</a> if you suspect unauthorized access to your account or any other security breach.
            </p>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              You may register using a third-party authentication provider (for example, Google, Apple, or GitHub). Your use of those providers is subject to their own terms, and we are not responsible for their acts or omissions.
            </p>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              Your Herpetoverse account may be linked to your Tarantuverse account so a single set of credentials unlocks both platforms. Linking is optional; you may keep accounts separate if you prefer.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">4. Your Content and License to Us</h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              &ldquo;Your Content&rdquo; means any information, text, photographs, comments, species submissions, forum posts, messages, lineage data, and other materials you submit, post, or transmit through the Service. You retain ownership of Your Content.
            </p>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              By submitting Your Content, you grant Appalachian Tarantulas, LLC a worldwide, non-exclusive, royalty-free, fully paid, sublicensable, and transferable license to host, store, reproduce, modify (for technical purposes such as resizing, compression, or format conversion), create derivative works from (for technical purposes such as thumbnail generation), publicly display, publicly perform, and distribute Your Content in connection with operating, providing, improving, and promoting the Service. This license continues for as long as Your Content remains on the Service and for a commercially reasonable period after removal to accommodate backups and caches.
            </p>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              You represent and warrant that (a) you own Your Content or have the rights necessary to grant the license above, (b) Your Content does not violate these Terms or any law, and (c) Your Content does not infringe the intellectual property, privacy, publicity, or other rights of any third party.
            </p>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              We do not claim ownership of Your Content, and we do not routinely monitor it. We may, but have no obligation to, review, remove, or refuse Your Content at our discretion.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">5. Community Guidelines and Prohibited Conduct</h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              <strong>Herpetoverse has a zero-tolerance policy for objectionable content and abusive behavior.</strong> You agree not to post, upload, transmit, or otherwise make available any of the following through the Service:
            </p>
            <ul className="list-disc pl-6 text-gray-700 dark:text-gray-300 space-y-2">
              <li>Hate speech, harassment, threats, bullying, or targeted attacks against individuals or groups;</li>
              <li>Illegal content, including illegal wildlife trade, trafficking of protected or CITES-listed species, controlled substances, weapons, or any content that violates applicable law;</li>
              <li>Offers to sell, trade, or give away animals in a way that would violate your local, state, or national law (including laws restricting interstate or international transport, invasive species, or prohibited venomous species);</li>
              <li>Sexually explicit, pornographic, or obscene material;</li>
              <li>Spam, scams, phishing attempts, deceptive schemes, or fraudulent content;</li>
              <li>Content that promotes, glorifies, or instructs in animal cruelty or mistreatment, including husbandry practices widely regarded as harmful (for example, knowingly pairing genes that produce neurologically compromised offspring for novelty);</li>
              <li>Personal information of another person without their explicit consent;</li>
              <li>Content that infringes any intellectual property, privacy, publicity, or contractual right;</li>
              <li>Malware, viruses, or any code designed to disrupt or damage the Service or any user;</li>
              <li>Impersonation of any person or entity, or misrepresentation of your affiliation with any person or entity.</li>
            </ul>
            <p className="text-gray-700 dark:text-gray-300 mt-4">
              You also agree not to: (a) reverse engineer, decompile, or attempt to extract the source code of the Service except as permitted by law; (b) access the Service by automated means (bots, scrapers, crawlers) except as expressly permitted in writing by us; (c) interfere with or disrupt the Service or its infrastructure; (d) probe or test the vulnerability of the Service or bypass any security measure; or (e) use the Service to develop a competing product.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">6. Reporting, Blocking, and Moderation</h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              You can report inappropriate content or users directly from forums, messages, and profiles. When you block a user, their content will be hidden from your feed, you will not receive messages from them, and our moderation team will be notified for review.
            </p>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              We review reports as promptly as reasonably possible. Where we determine that content or conduct violates these Terms, we may remove content, restrict features, suspend or terminate accounts, or take any other action we consider appropriate, with or without notice. In cases involving imminent risk of harm, illegal wildlife activity, or other illegal conduct, we may report the matter to law enforcement or to relevant regulatory authorities (including the U.S. Fish and Wildlife Service or state wildlife agencies where appropriate).
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">7. Intellectual Property in the Service</h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              The Service, including its software, design, text, graphics, logos, trademarks, species database, gene catalog, morph calculator, and other content we provide (excluding Your Content), is owned by or licensed to Appalachian Tarantulas, LLC and is protected by copyright, trademark, and other intellectual property laws. We grant you a limited, revocable, non-exclusive, non-transferable, non-sublicensable license to access and use the Service for your personal, non-commercial use, subject to these Terms. All rights not expressly granted are reserved.
            </p>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              &ldquo;Herpetoverse,&rdquo; the Herpetoverse logo, and related names and marks are trademarks of Appalachian Tarantulas, LLC. You may not use them without our prior written permission.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">8. No Husbandry, Medical, or Veterinary Advice</h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              Information provided through the Service — including species care sheets, feeding schedules, enclosure recommendations, breeding content, gene catalogs, welfare notes, and algorithmic features such as shed prediction, feeding reminders, and the morph calculator — is for general educational and informational purposes only. <strong>It is not a substitute for professional veterinary, medical, or expert husbandry advice.</strong> Species data may be incomplete, outdated, community-submitted, or incorrect. Genetic outcome predictions from the morph calculator describe statistical probabilities and are not guarantees about any actual clutch. Algorithmic reminders and predictions are generated from limited data and may be wrong.
            </p>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              You are solely responsible for the welfare of any animal in your care and for verifying information with qualified veterinary or husbandry professionals before acting on it. Some reptiles kept by users of the Service are venomous, medically significant, or require specialized safe-handling and enclosure standards (including, for some taxa, licenses or permits). You assume full responsibility for safely and lawfully keeping, handling, breeding, transporting, and housing any animal.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">9. Third-Party Services and Links</h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              The Service uses and links to third-party services (for example, cloud hosting, storage, email delivery, analytics, payment processors, and OAuth providers). We are not responsible for third-party services or content, and your use of them is governed by their own terms and privacy policies. Outages, changes, or security incidents affecting third-party services may affect the Service, and we disclaim liability for such events to the fullest extent permitted by law.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">10. Subscriptions and Payments</h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              Certain features of the Service may be offered on a paid subscription basis (&ldquo;Subscriptions&rdquo;). Subscription pricing, features, and billing intervals will be disclosed at the point of purchase.
            </p>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              <strong>Web payments.</strong> If you subscribe through our website, you authorize our third-party payment processor to charge your chosen payment method on a recurring basis at the stated interval until you cancel. You may cancel at any time from your account settings; cancellation takes effect at the end of the current billing period.
            </p>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              <strong>Mobile in-app purchases.</strong> If you subscribe through the Apple App Store or Google Play, billing, renewal, and cancellation are managed by that platform under its own terms. Subscriptions purchased through a mobile store automatically renew unless canceled at least 24 hours before the end of the current period. You can manage and cancel such Subscriptions in your App Store or Google Play account settings.
            </p>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              <strong>Refunds.</strong> Except where required by law, Subscription fees are non-refundable and partial periods will not be refunded. Your statutory rights under applicable consumer-protection laws (for example, in the European Union, United Kingdom, or certain U.S. states) are not affected by this paragraph.
            </p>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              <strong>Taxes.</strong> You are responsible for any sales, use, value-added, or similar taxes associated with your Subscription, unless we are required to collect them.
            </p>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              <strong>Price changes.</strong> We may change Subscription prices with reasonable prior notice, which will take effect at your next renewal.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">11. Termination and Account Deletion</h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              You may stop using the Service at any time and may delete your account at <Link href="/herpetoverse/delete-account" className="text-emerald-600 dark:text-emerald-400 hover:underline">/herpetoverse/delete-account</Link>. Deletion is permanent and irreversible. Before deleting, you may export your data from <Link href="/herpetoverse/dashboard/settings/data-export" className="text-emerald-600 dark:text-emerald-400 hover:underline">Settings → Data Export</Link>.
            </p>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              We may suspend, restrict, or terminate your account or access to the Service at any time, with or without notice, if we believe you have violated these Terms, if required by law, or if continued access creates risk to the Service, to other users, or to us. Serious or repeated violations may result in permanent termination without prior notice. Upon termination, the license granted to you in Section 7 ends immediately. Sections that by their nature should survive termination (including Sections 4, 7, 8, 13, 14, 15, 17, and 18) will survive.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">12. Copyright and DMCA Policy</h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              We respect intellectual property rights and respond to valid notices of alleged copyright infringement under the U.S. Digital Millennium Copyright Act (17 U.S.C. § 512). If you believe content on the Service infringes your copyright, please send a written notice to our designated agent containing:
            </p>
            <ul className="list-disc pl-6 text-gray-700 dark:text-gray-300 space-y-2">
              <li>Identification of the copyrighted work claimed to be infringed;</li>
              <li>Identification of the allegedly infringing material and its location on the Service (such as a URL);</li>
              <li>Your contact information (name, address, phone, email);</li>
              <li>A statement that you have a good-faith belief that the use is not authorized by the copyright owner, its agent, or the law;</li>
              <li>A statement, under penalty of perjury, that the information in the notice is accurate and that you are the owner of, or authorized to act on behalf of the owner of, the exclusive right allegedly infringed;</li>
              <li>Your physical or electronic signature.</li>
            </ul>
            <p className="text-gray-700 dark:text-gray-300 mt-4">
              Send notices to our designated agent at <a href="mailto:dmca@tarantuverse.com" className="text-emerald-600 dark:text-emerald-400 hover:underline">dmca@tarantuverse.com</a>. We may remove or disable allegedly infringing content and may terminate accounts of repeat infringers. If you believe content was removed in error, you may submit a counter-notice meeting the DMCA&rsquo;s requirements to the same address.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">13. Disclaimer of Warranties</h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              <strong>THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE,&rdquo; WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS, IMPLIED, OR STATUTORY. TO THE FULLEST EXTENT PERMITTED BY LAW, APPALACHIAN TARANTULAS, LLC AND ITS OFFICERS, EMPLOYEES, AGENTS, AND AFFILIATES (COLLECTIVELY, THE &ldquo;COMPANY PARTIES&rdquo;) DISCLAIM ALL WARRANTIES, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, TITLE, ACCURACY, AND QUIET ENJOYMENT. THE COMPANY PARTIES DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, SECURE, ERROR-FREE, OR FREE OF VIRUSES, OR THAT ANY INFORMATION OBTAINED THROUGH THE SERVICE (INCLUDING SPECIES DATA, CARE RECOMMENDATIONS, GENETIC PREDICTIONS, OR USER-GENERATED CONTENT) IS ACCURATE, COMPLETE, OR CURRENT.</strong>
            </p>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              Some jurisdictions do not allow the exclusion of certain warranties, so some of the above exclusions may not apply to you. In such cases, our warranties are limited to the greatest extent permitted by applicable law.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">14. Limitation of Liability</h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              <strong>TO THE FULLEST EXTENT PERMITTED BY LAW, THE COMPANY PARTIES WILL NOT BE LIABLE TO YOU FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR FOR ANY LOSS OF PROFITS, REVENUE, DATA, GOODWILL, OR ANIMAL LIFE OR HEALTH, ARISING OUT OF OR RELATING TO THESE TERMS OR YOUR USE OF (OR INABILITY TO USE) THE SERVICE, WHETHER BASED ON WARRANTY, CONTRACT, TORT (INCLUDING NEGLIGENCE), STATUTE, OR ANY OTHER LEGAL THEORY, AND WHETHER OR NOT WE HAVE BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.</strong>
            </p>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              <strong>IN ANY EVENT, THE COMPANY PARTIES&rsquo; TOTAL CUMULATIVE LIABILITY ARISING OUT OF OR RELATING TO THESE TERMS OR THE SERVICE WILL NOT EXCEED THE GREATER OF (A) THE TOTAL AMOUNTS YOU PAID TO US FOR THE SERVICE IN THE TWELVE (12) MONTHS IMMEDIATELY PRECEDING THE EVENT GIVING RISE TO THE CLAIM, OR (B) ONE HUNDRED U.S. DOLLARS ($100.00).</strong>
            </p>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              The limitations in this Section 14 apply to the fullest extent permitted by law, even if a limited remedy fails of its essential purpose. Some jurisdictions do not allow the exclusion or limitation of certain damages, so some of the above limitations may not apply to you.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">15. Indemnification</h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              You agree to defend, indemnify, and hold harmless the Company Parties from and against any and all claims, liabilities, damages, losses, and expenses (including reasonable attorneys&rsquo; fees) arising out of or relating to (a) Your Content, (b) your use or misuse of the Service, (c) your violation of these Terms, (d) your violation of any law (including wildlife, import/export, permitting, or animal-welfare laws) or the rights of any third party, or (e) any injury or damage caused by an animal in your care. We may assume exclusive defense and control of any matter subject to indemnification, in which case you agree to cooperate with us in asserting any available defenses.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">16. Changes to the Service and to These Terms</h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              We may add, change, suspend, or discontinue any part of the Service at any time without liability, and may impose limits on features or restrict access to parts of the Service.
            </p>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              We may also update these Terms from time to time. If we make material changes, we will provide reasonable notice, such as by posting a notice in the Service or emailing the address associated with your account. The &ldquo;Last Updated&rdquo; date at the top shows when these Terms were last revised. Continued use of the Service after the effective date of the updated Terms constitutes your acceptance of them. If you do not agree to the updated Terms, you must stop using the Service.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">17. Governing Law; Dispute Resolution</h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              These Terms and any dispute arising out of or relating to them or the Service are governed by the laws of the <strong>State of Tennessee, USA</strong>, without regard to its conflict-of-laws rules. The United Nations Convention on Contracts for the International Sale of Goods does not apply.
            </p>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              <strong>Informal resolution.</strong> Before filing any claim, you agree to try to resolve the dispute informally by contacting <a href="mailto:legal@tarantuverse.com" className="text-emerald-600 dark:text-emerald-400 hover:underline">legal@tarantuverse.com</a> and describing the claim. We will try to resolve the matter in good faith within thirty (30) days.
            </p>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              <strong>Exclusive venue.</strong> Subject to the informal-resolution requirement above, you and Appalachian Tarantulas, LLC agree that any claim not resolved informally must be brought exclusively in the state or federal courts located in Knox County, Tennessee, and both parties consent to personal jurisdiction and venue there. Either party may seek injunctive or equitable relief in any court of competent jurisdiction to protect its intellectual property or confidential information.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">18. General</h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              <strong>Entire agreement.</strong> These Terms, together with the Privacy Policy and any other policies referenced here, are the entire agreement between you and Appalachian Tarantulas, LLC regarding the Service and supersede all prior or contemporaneous understandings.
            </p>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              <strong>Severability.</strong> If any provision of these Terms is held invalid or unenforceable, the remaining provisions will remain in full force and effect, and the invalid provision will be modified only to the extent necessary to make it enforceable.
            </p>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              <strong>No waiver.</strong> Our failure to enforce any right or provision of these Terms will not be a waiver of that right or provision.
            </p>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              <strong>Assignment.</strong> You may not assign or transfer these Terms, by operation of law or otherwise, without our prior written consent. We may assign these Terms freely, including in connection with a merger, acquisition, or sale of assets. Any purported assignment in violation of this section is void.
            </p>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              <strong>Force majeure.</strong> Neither party will be liable for any failure or delay in performance caused by events beyond its reasonable control, including natural disasters, acts of government, network or utility failures, or failures of third-party services.
            </p>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              <strong>Export and sanctions.</strong> You agree to comply with all applicable export-control and sanctions laws, and you represent that you are not located in, or a national or resident of, any country or on any list that would prohibit your use of the Service under those laws.
            </p>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              <strong>No agency.</strong> Nothing in these Terms creates any agency, partnership, joint venture, employment, or franchise relationship between you and Appalachian Tarantulas, LLC.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">19. Contact</h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              Questions about these Terms? Contact us at <a href="mailto:support@tarantuverse.com" className="text-emerald-600 dark:text-emerald-400 hover:underline">support@tarantuverse.com</a>. Legal notices should be directed to <a href="mailto:legal@tarantuverse.com" className="text-emerald-600 dark:text-emerald-400 hover:underline">legal@tarantuverse.com</a>. DMCA notices should be sent to <a href="mailto:dmca@tarantuverse.com" className="text-emerald-600 dark:text-emerald-400 hover:underline">dmca@tarantuverse.com</a>.
            </p>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              Appalachian Tarantulas, LLC<br />
              Tennessee, USA
            </p>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-gray-100 dark:bg-gray-800 py-8 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-gray-600 dark:text-gray-400">
          <p>&copy; 2026 Appalachian Tarantulas, LLC. All rights reserved.</p>
          <div className="mt-4 space-x-4">
            <Link href="/herpetoverse/privacy-policy" className="hover:text-emerald-600 dark:hover:text-emerald-400">Privacy Policy</Link>
            <Link href="/herpetoverse/terms" className="hover:text-emerald-600 dark:hover:text-emerald-400">Terms of Service</Link>
            <a href="https://tarantuverse.com" className="hover:text-emerald-600 dark:hover:text-emerald-400">Tarantuverse</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
