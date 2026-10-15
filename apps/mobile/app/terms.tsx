/**
 * In-app Terms of Service. Mirrors the web Terms (apps/web/src/app/terms/
 * page.tsx) — when that page changes, change this one and its date too.
 *
 * Store rule: App Store copy must never name another platform's store (and
 * vice versa), so the in-app-purchase paragraph is platform-conditional.
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../src/contexts/ThemeContext';
import { SPACING, TYPE } from '../src/theme/tokens';

const LAST_UPDATED = 'April 21, 2026';

const STORE_NAME = Platform.OS === 'ios' ? 'the App Store' : 'Google Play';
const STORE_SETTINGS = Platform.OS === 'ios' ? 'App Store account settings' : 'Google Play account settings';

export default function TermsScreen() {
  const router = useRouter();
  const { colors } = useTheme();

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: SPACING.lg,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backButton: { marginRight: SPACING.md },
    headerTitle: { ...TYPE.heading, color: colors.textPrimary },
    scrollContent: { padding: SPACING.xl - SPACING.xs },
    title: { ...TYPE.display, color: colors.textPrimary, marginBottom: SPACING.sm },
    lastUpdated: { ...TYPE.body, color: colors.textTertiary, marginBottom: SPACING.xl },
    section: { marginBottom: SPACING.xl },
    sectionTitle: { ...TYPE.heading, color: colors.textPrimary, marginBottom: SPACING.md },
    text: { ...TYPE.body, lineHeight: 22, color: colors.textSecondary, marginBottom: SPACING.md },
    bulletPoint: { flexDirection: 'row', marginBottom: SPACING.sm },
    bullet: { ...TYPE.body, color: colors.textSecondary, marginRight: SPACING.sm },
    bulletText: { ...TYPE.body, lineHeight: 22, flex: 1, color: colors.textSecondary },
    emphasis: { fontWeight: '700', color: colors.textPrimary },
    link: { color: colors.primary, fontWeight: '600' },
  });

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} accessibilityRole="header">{title}</Text>
      {children}
    </View>
  );
  const P = ({ children }: { children: React.ReactNode }) => <Text style={styles.text}>{children}</Text>;
  const B = ({ children }: { children: React.ReactNode }) => <Text style={styles.emphasis}>{children}</Text>;
  const Bullets = ({ items }: { items: string[] }) => (
    <>
      {items.map((item) => (
        <View key={item} style={styles.bulletPoint}>
          <Text style={styles.bullet}>•</Text>
          <Text style={styles.bulletText}>{item}</Text>
        </View>
      ))}
    </>
  );
  const Mail = ({ to }: { to: string }) => (
    <Text style={styles.link} onPress={() => Linking.openURL(`mailto:${to}`).catch(() => {})}>
      {to}
    </Text>
  );
  const Web = ({ path, label }: { path: string; label: string }) => (
    <Text
      style={styles.link}
      onPress={() => Linking.openURL(`https://www.tarantuverse.com${path}`).catch(() => {})}
    >
      {label}
    </Text>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton} accessibilityLabel="Back">
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Terms of Service</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Terms of Service</Text>
        <Text style={styles.lastUpdated}>
          Last Updated: {LAST_UPDATED} · Effective: {LAST_UPDATED}
        </Text>

        <View style={styles.section}>
          <P>
            Welcome to Tarantuverse. These Terms of Service (the “Terms”) form a binding agreement between you and{' '}
            <B>Appalachian Tarantulas, LLC</B>, a Tennessee limited liability company (“Appalachian Tarantulas,” “we,”
            “us,” or “our”), and govern your access to and use of the Tarantuverse website, mobile applications, and
            related services (collectively, the “Service”). Please read these Terms carefully. By creating an account or
            otherwise using the Service, you agree to be bound by these Terms and by our{' '}
            <Web path="/privacy-policy" label="Privacy Policy" />.
          </P>
          <P>
            <B>
              Please read Section 14 (Limitation of Liability) and Section 17 (Governing Law; Dispute Resolution)
              carefully. They limit our liability to you and specify how disputes must be resolved.
            </B>
          </P>
        </View>

        <Section title="1. Eligibility">
          <P>
            You must be at least 13 years old to create an account. If you are between 13 and the age of majority in
            your jurisdiction, you may only use the Service with the involvement and consent of a parent or legal
            guardian who agrees to these Terms on your behalf. The Service is not directed to children under 13, and we
            do not knowingly collect personal information from children under 13. If you believe a child under 13 has
            created an account, please contact us at <Mail to="support@tarantuverse.com" /> so we can remove it.
          </P>
          <P>
            By using the Service, you represent and warrant that (a) you meet the age requirement above, (b) you have
            the legal capacity to enter into these Terms, and (c) your use of the Service will comply with all applicable
            laws and regulations.
          </P>
        </Section>

        <Section title="2. The Service">
          <P>
            Tarantuverse is a husbandry-tracking and community platform for keepers of tarantulas and other
            invertebrates. It lets you record information about animals in your care (feeding, molts, substrate
            changes, breeding, photos, and similar records), browse species care information, and participate in
            community features including forums, profiles, follows, direct messages, and activity feeds. We may add,
            modify, or remove features at any time.
          </P>
        </Section>

        <Section title="3. Accounts and Account Security">
          <P>
            You must register for an account to use most features of the Service. You agree to provide accurate
            information, to keep it up to date, and to keep your login credentials confidential. You are responsible for
            all activity that occurs under your account. You must notify us promptly at{' '}
            <Mail to="support@tarantuverse.com" /> if you suspect unauthorized access to your account or any other
            security breach.
          </P>
          <P>
            You may register using a third-party authentication provider (for example, Google, Apple, or GitHub). Your
            use of those providers is subject to their own terms, and we are not responsible for their acts or
            omissions.
          </P>
        </Section>

        <Section title="4. Your Content and License to Us">
          <P>
            “Your Content” means any information, text, photographs, comments, species submissions, forum posts,
            messages, and other materials you submit, post, or transmit through the Service. You retain ownership of
            Your Content.
          </P>
          <P>
            By submitting Your Content, you grant Appalachian Tarantulas, LLC a worldwide, non-exclusive, royalty-free,
            fully paid, sublicensable, and transferable license to host, store, reproduce, modify (for technical purposes
            such as resizing, compression, or format conversion), create derivative works from (for technical purposes
            such as thumbnail generation), publicly display, publicly perform, and distribute Your Content in connection
            with operating, providing, improving, and promoting the Service. This license continues for as long as Your
            Content remains on the Service and for a commercially reasonable period after removal to accommodate backups
            and caches.
          </P>
          <P>
            You represent and warrant that (a) you own Your Content or have the rights necessary to grant the license
            above, (b) Your Content does not violate these Terms or any law, and (c) Your Content does not infringe the
            intellectual property, privacy, publicity, or other rights of any third party.
          </P>
          <P>
            We do not claim ownership of Your Content, and we do not routinely monitor it. We may, but have no
            obligation to, review, remove, or refuse Your Content at our discretion.
          </P>
        </Section>

        <Section title="5. Community Guidelines and Prohibited Conduct">
          <P>
            <B>Tarantuverse has a zero-tolerance policy for objectionable content and abusive behavior.</B> You agree
            not to post, upload, transmit, or otherwise make available any of the following through the Service:
          </P>
          <Bullets
            items={[
              'Hate speech, harassment, threats, bullying, or targeted attacks against individuals or groups;',
              'Illegal content, including illegal wildlife trade, controlled substances, weapons, or any content that violates applicable law;',
              'Sexually explicit, pornographic, or obscene material;',
              'Spam, scams, phishing attempts, deceptive schemes, or fraudulent content;',
              'Content that promotes, glorifies, or instructs in animal cruelty or mistreatment;',
              'Personal information of another person without their explicit consent;',
              'Content that infringes any intellectual property, privacy, publicity, or contractual right;',
              'Malware, viruses, or any code designed to disrupt or damage the Service or any user;',
              'Impersonation of any person or entity, or misrepresentation of your affiliation with any person or entity.',
            ]}
          />
          <P>
            You also agree not to: (a) reverse engineer, decompile, or attempt to extract the source code of the Service
            except as permitted by law; (b) access the Service by automated means (bots, scrapers, crawlers) except as
            expressly permitted in writing by us; (c) interfere with or disrupt the Service or its infrastructure; (d)
            probe or test the vulnerability of the Service or bypass any security measure; or (e) use the Service to
            develop a competing product.
          </P>
        </Section>

        <Section title="6. Reporting, Blocking, and Moderation">
          <P>
            You can report inappropriate content or users directly from forums, messages, and profiles. When you block
            a user, their content will be hidden from your feed, you will not receive messages from them, and our
            moderation team will be notified for review.
          </P>
          <P>
            We review reports as promptly as reasonably possible. Where we determine that content or conduct violates
            these Terms, we may remove content, restrict features, suspend or terminate accounts, or take any other
            action we consider appropriate, with or without notice. In cases involving imminent risk of harm or illegal
            conduct, we may report the matter to law enforcement.
          </P>
        </Section>

        <Section title="7. Intellectual Property in the Service">
          <P>
            The Service, including its software, design, text, graphics, logos, trademarks, species database, and other
            content we provide (excluding Your Content), is owned by or licensed to Appalachian Tarantulas, LLC and is
            protected by copyright, trademark, and other intellectual property laws. We grant you a limited, revocable,
            non-exclusive, non-transferable, non-sublicensable license to access and use the Service for your personal,
            non-commercial use, subject to these Terms. All rights not expressly granted are reserved.
          </P>
          <P>
            “Tarantuverse,” the Tarantuverse logo, and related names and marks are trademarks of Appalachian
            Tarantulas, LLC. You may not use them without our prior written permission.
          </P>
        </Section>

        <Section title="8. No Husbandry, Medical, or Veterinary Advice">
          <P>
            Information provided through the Service — including species care sheets, feeding schedules, substrate
            recommendations, breeding content, and algorithmic features such as premolt prediction or feeding reminders
            — is for general educational and informational purposes only.{' '}
            <B>It is not a substitute for professional veterinary, medical, or expert husbandry advice.</B> Species
            data may be incomplete, outdated, community-submitted, or incorrect. Predictions and reminders are generated
            algorithmically from limited data and may be wrong.
          </P>
          <P>
            You are solely responsible for the welfare of any animal in your care and for verifying information with
            qualified veterinary or husbandry professionals before acting on it. Some species kept by users of the
            Service have medically significant venom or urticating hairs; you assume full responsibility for safely
            keeping, handling, and housing any animal.
          </P>
        </Section>

        <Section title="9. Third-Party Services and Links">
          <P>
            The Service uses and links to third-party services (for example, cloud hosting, storage, email delivery,
            analytics, payment processors, and OAuth providers). We are not responsible for third-party services or
            content, and your use of them is governed by their own terms and privacy policies. Outages, changes, or
            security incidents affecting third-party services may affect the Service, and we disclaim liability for
            such events to the fullest extent permitted by law.
          </P>
        </Section>

        <Section title="10. Subscriptions and Payments">
          <P>
            Certain features of the Service may be offered on a paid subscription basis (“Subscriptions”). Subscription
            pricing, features, and billing intervals will be disclosed at the point of purchase.
          </P>
          <P>
            <B>In-app purchases.</B> {`If you subscribe through ${STORE_NAME}, payment is charged to your ${
              Platform.OS === 'ios' ? 'Apple ID' : 'Google Play account'
            } at confirmation of purchase, and billing, renewal, and cancellation are managed by ${STORE_NAME} under its own terms. Subscriptions automatically renew unless canceled at least 24 hours before the end of the current period. You can manage and cancel them in your ${STORE_SETTINGS}.`}
          </P>
          <P>
            <B>Web payments.</B> If you subscribe through our website, you authorize our third-party payment processor
            to charge your chosen payment method on a recurring basis at the stated interval until you cancel. You may
            cancel at any time from your account settings; cancellation takes effect at the end of the current billing
            period.
          </P>
          <P>
            <B>Refunds.</B> Except where required by law, Subscription fees are non-refundable and partial periods will
            not be refunded. Your statutory rights under applicable consumer-protection laws (for example, in the
            European Union, United Kingdom, or certain U.S. states) are not affected by this paragraph.
          </P>
          <P>
            <B>Taxes.</B> You are responsible for any sales, use, value-added, or similar taxes associated with your
            Subscription, unless we are required to collect them.
          </P>
          <P>
            <B>Price changes.</B> We may change Subscription prices with reasonable prior notice, which will take effect
            at your next renewal.
          </P>
        </Section>

        <Section title="11. Termination and Account Deletion">
          <P>
            You may stop using the Service at any time and may delete your account in the app (Profile → Delete
            account) or at <Web path="/delete-account" label="tarantuverse.com/delete-account" />. Deletion is permanent
            and irreversible. Before deleting, you may export your data from Settings → Data Export.
          </P>
          <P>
            We may suspend, restrict, or terminate your account or access to the Service at any time, with or without
            notice, if we believe you have violated these Terms, if required by law, or if continued access creates risk
            to the Service, to other users, or to us. Serious or repeated violations may result in permanent termination
            without prior notice. Upon termination, the license granted to you in Section 7 ends immediately. Sections
            that by their nature should survive termination (including Sections 4, 7, 8, 13, 14, 15, 17, and 18) will
            survive.
          </P>
        </Section>

        <Section title="12. Copyright and DMCA Policy">
          <P>
            We respect intellectual property rights and respond to valid notices of alleged copyright infringement under
            the U.S. Digital Millennium Copyright Act (17 U.S.C. § 512). If you believe content on the Service infringes
            your copyright, please send a written notice to our designated agent containing:
          </P>
          <Bullets
            items={[
              'Identification of the copyrighted work claimed to be infringed;',
              'Identification of the allegedly infringing material and its location on the Service (such as a URL);',
              'Your contact information (name, address, phone, email);',
              'A statement that you have a good-faith belief that the use is not authorized by the copyright owner, its agent, or the law;',
              'A statement, under penalty of perjury, that the information in the notice is accurate and that you are the owner of, or authorized to act on behalf of the owner of, the exclusive right allegedly infringed;',
              'Your physical or electronic signature.',
            ]}
          />
          <P>
            Send notices to our designated agent at <Mail to="dmca@tarantuverse.com" />. We may remove or disable
            allegedly infringing content and may terminate accounts of repeat infringers. If you believe content was
            removed in error, you may submit a counter-notice meeting the DMCA’s requirements to the same address.
          </P>
        </Section>

        <Section title="13. Disclaimer of Warranties">
          <P>
            <B>
              THE SERVICE IS PROVIDED “AS IS” AND “AS AVAILABLE,” WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS,
              IMPLIED, OR STATUTORY. TO THE FULLEST EXTENT PERMITTED BY LAW, APPALACHIAN TARANTULAS, LLC AND ITS
              OFFICERS, EMPLOYEES, AGENTS, AND AFFILIATES (COLLECTIVELY, THE “COMPANY PARTIES”) DISCLAIM ALL WARRANTIES,
              INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, TITLE,
              ACCURACY, AND QUIET ENJOYMENT. THE COMPANY PARTIES DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED,
              SECURE, ERROR-FREE, OR FREE OF VIRUSES, OR THAT ANY INFORMATION OBTAINED THROUGH THE SERVICE (INCLUDING
              SPECIES DATA, CARE RECOMMENDATIONS, PREDICTIONS, OR USER-GENERATED CONTENT) IS ACCURATE, COMPLETE, OR
              CURRENT.
            </B>
          </P>
          <P>
            Some jurisdictions do not allow the exclusion of certain warranties, so some of the above exclusions may not
            apply to you. In such cases, our warranties are limited to the greatest extent permitted by applicable law.
          </P>
        </Section>

        <Section title="14. Limitation of Liability">
          <P>
            <B>
              TO THE FULLEST EXTENT PERMITTED BY LAW, THE COMPANY PARTIES WILL NOT BE LIABLE TO YOU FOR ANY INDIRECT,
              INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR FOR ANY LOSS OF PROFITS, REVENUE,
              DATA, GOODWILL, OR ANIMAL LIFE OR HEALTH, ARISING OUT OF OR RELATING TO THESE TERMS OR YOUR USE OF (OR
              INABILITY TO USE) THE SERVICE, WHETHER BASED ON WARRANTY, CONTRACT, TORT (INCLUDING NEGLIGENCE), STATUTE,
              OR ANY OTHER LEGAL THEORY, AND WHETHER OR NOT WE HAVE BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
            </B>
          </P>
          <P>
            <B>
              IN ANY EVENT, THE COMPANY PARTIES’ TOTAL CUMULATIVE LIABILITY ARISING OUT OF OR RELATING TO THESE TERMS OR
              THE SERVICE WILL NOT EXCEED THE GREATER OF (A) THE TOTAL AMOUNTS YOU PAID TO US FOR THE SERVICE IN THE
              TWELVE (12) MONTHS IMMEDIATELY PRECEDING THE EVENT GIVING RISE TO THE CLAIM, OR (B) ONE HUNDRED U.S.
              DOLLARS ($100.00).
            </B>
          </P>
          <P>
            The limitations in this Section 14 apply to the fullest extent permitted by law, even if a limited remedy
            fails of its essential purpose. Some jurisdictions do not allow the exclusion or limitation of certain
            damages, so some of the above limitations may not apply to you.
          </P>
        </Section>

        <Section title="15. Indemnification">
          <P>
            You agree to defend, indemnify, and hold harmless the Company Parties from and against any and all claims,
            liabilities, damages, losses, and expenses (including reasonable attorneys’ fees) arising out of or relating
            to (a) Your Content, (b) your use or misuse of the Service, (c) your violation of these Terms, or (d) your
            violation of any law or the rights of any third party. We may assume exclusive defense and control of any
            matter subject to indemnification, in which case you agree to cooperate with us in asserting any available
            defenses.
          </P>
        </Section>

        <Section title="16. Changes to the Service and to These Terms">
          <P>
            We may add, change, suspend, or discontinue any part of the Service at any time without liability, and may
            impose limits on features or restrict access to parts of the Service.
          </P>
          <P>
            We may also update these Terms from time to time. If we make material changes, we will provide reasonable
            notice, such as by posting a notice in the Service or emailing the address associated with your account.
            The “Last Updated” date at the top shows when these Terms were last revised. Continued use of the Service
            after the effective date of the updated Terms constitutes your acceptance of them. If you do not agree to
            the updated Terms, you must stop using the Service.
          </P>
        </Section>

        <Section title="17. Governing Law; Dispute Resolution">
          <P>
            These Terms and any dispute arising out of or relating to them or the Service are governed by the laws of
            the <B>State of Tennessee, USA</B>, without regard to its conflict-of-laws rules. The United Nations
            Convention on Contracts for the International Sale of Goods does not apply.
          </P>
          <P>
            <B>Informal resolution.</B> Before filing any claim, you agree to try to resolve the dispute informally by
            contacting <Mail to="legal@tarantuverse.com" /> and describing the claim. We will try to resolve the matter
            in good faith within thirty (30) days.
          </P>
          <P>
            <B>Exclusive venue.</B> Subject to the informal-resolution requirement above, you and Appalachian
            Tarantulas, LLC agree that any claim not resolved informally must be brought exclusively in the state or
            federal courts located in Knox County, Tennessee, and both parties consent to personal jurisdiction and
            venue there. Either party may seek injunctive or equitable relief in any court of competent jurisdiction to
            protect its intellectual property or confidential information.
          </P>
        </Section>

        <Section title="18. General">
          <P>
            <B>Entire agreement.</B> These Terms, together with the Privacy Policy and any other policies referenced
            here, are the entire agreement between you and Appalachian Tarantulas, LLC regarding the Service and
            supersede all prior or contemporaneous understandings.
          </P>
          <P>
            <B>Severability.</B> If any provision of these Terms is held invalid or unenforceable, the remaining
            provisions will remain in full force and effect, and the invalid provision will be modified only to the
            extent necessary to make it enforceable.
          </P>
          <P>
            <B>No waiver.</B> Our failure to enforce any right or provision of these Terms will not be a waiver of that
            right or provision.
          </P>
          <P>
            <B>Assignment.</B> You may not assign or transfer these Terms, by operation of law or otherwise, without our
            prior written consent. We may assign these Terms freely, including in connection with a merger,
            acquisition, or sale of assets. Any purported assignment in violation of this section is void.
          </P>
          <P>
            <B>Force majeure.</B> Neither party will be liable for any failure or delay in performance caused by events
            beyond its reasonable control, including natural disasters, acts of government, network or utility
            failures, or failures of third-party services.
          </P>
          <P>
            <B>Export and sanctions.</B> You agree to comply with all applicable export-control and sanctions laws, and
            you represent that you are not located in, or a national or resident of, any country or on any list that
            would prohibit your use of the Service under those laws.
          </P>
          <P>
            <B>No agency.</B> Nothing in these Terms creates any agency, partnership, joint venture, employment, or
            franchise relationship between you and Appalachian Tarantulas, LLC.
          </P>
        </Section>

        <Section title="19. Contact">
          <P>
            Questions about these Terms? Contact us at <Mail to="support@tarantuverse.com" />. Legal notices should be
            directed to <Mail to="legal@tarantuverse.com" />. DMCA notices should be sent to{' '}
            <Mail to="dmca@tarantuverse.com" />.
          </P>
          <P>Appalachian Tarantulas, LLC{'\n'}Tennessee, USA</P>
        </Section>

        <View style={{ height: SPACING.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}
