import React from 'react';

interface PrivacyPolicyProps {
  onClose: () => void;
}

export default function PrivacyPolicy({ onClose }: PrivacyPolicyProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose}></div>
      <div 
        className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-xl border border-amber-600/20 bg-gradient-to-br from-gray-900/90 to-gray-800/90 p-6 shadow-xl"
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-2 text-gray-400 hover:bg-gray-800/50 hover:text-amber-600 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>

        <h2 className="text-2xl font-bold text-amber-500 mb-6">Privacy Policy</h2>
        
        <div className="text-gray-300 space-y-6">
          <p>Last Updated: March 7, 2025</p>
          
          <section className="space-y-3">
            <h3 className="text-lg font-semibold text-amber-400">1. Introduction</h3>
            <p>
              Welcome to Trivia.Box. We respect your privacy and are committed to protecting your personal data. 
              This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our service.
            </p>
          </section>
          
          <section className="space-y-3">
            <h3 className="text-lg font-semibold text-amber-400">2. Information We Collect</h3>
            <p>We collect information in the following ways:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <span className="font-medium text-amber-300">Wallet Address:</span> When you connect your wallet, 
                we collect your wallet address to track your progress and distribute rewards.
              </li>
              <li>
                <span className="font-medium text-amber-300">Game Data:</span> We collect information about your gameplay, 
                including scores, answers, rewards earned, and leaderboard rankings.
              </li>
              <li>
                <span className="font-medium text-amber-300">Blockchain Data:</span> Information related to your web3 wallet 
                transactions on public blockchains that are necessary for distributing rewards.
              </li>
            </ul>
          </section>
          
          <section className="space-y-3">
            <h3 className="text-lg font-semibold text-amber-400">3. How We Use Your Information</h3>
            <p>We use your information for the following purposes:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>To provide, maintain, and improve our services</li>
              <li>To process transactions and distribute rewards</li>
              <li>To create and maintain your account</li>
              <li>To provide customer support</li>
              <li>To communicate with you about updates and promotions</li>
              <li>To monitor and analyze usage patterns and trends</li>
              <li>To protect the security and integrity of our platform</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h3 className="text-lg font-semibold text-amber-400">4. Sharing Your Information</h3>
            <p>We may share your information in the following circumstances:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>With service providers who help us operate our platform</li>
              <li>To comply with legal obligations</li>
              <li>To protect our rights, privacy, safety, or property</li>
              <li>In connection with a business transfer or transaction</li>
              <li>With your consent or at your direction</li>
            </ul>
            <p>We do not sell your personal information to third parties.</p>
          </section>
          
          <section className="space-y-3">
            <h3 className="text-lg font-semibold text-amber-400">5. Data Security</h3>
            <p>
              We implement appropriate security measures to protect your personal information. 
              However, no method of transmission over the Internet or electronic storage is 100% secure, 
              and we cannot guarantee absolute security.
            </p>
          </section>
          
          <section className="space-y-3">
            <h3 className="text-lg font-semibold text-amber-400">6. Your Rights</h3>
            <p>Depending on your location, you may have certain rights regarding your personal information, including:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>The right to access your personal information</li>
              <li>The right to correct inaccurate or incomplete information</li>
              <li>The right to delete your personal information</li>
              <li>The right to restrict or object to processing</li>
              <li>The right to data portability</li>
            </ul>
            <p>To exercise these rights, please contact us using the information provided below.</p>
          </section>
          
          <section className="space-y-3">
            <h3 className="text-lg font-semibold text-amber-400">7. Third-Party Links</h3>
            <p>
              Our service may contain links to third-party websites or services. We are not responsible 
              for the privacy practices of these third parties, and we encourage you to read their privacy policies.
            </p>
          </section>
          

          
          <section className="space-y-3">
            <h3 className="text-lg font-semibold text-amber-400">9. Changes to This Privacy Policy</h3>
            <p>
              We may update our Privacy Policy from time to time. We will notify you of any changes by 
              posting the new Privacy Policy on this page and updating the &quot;Last Updated&quot; date. 
              You are advised to review this Privacy Policy periodically for any changes.
            </p>
          </section>
          
          <section className="space-y-3">
            <h3 className="text-lg font-semibold text-amber-400">10. Contact Us</h3>
            <p>
              If you have any questions about this Privacy Policy, please contact us at:
            </p>
            <p className="text-amber-400">host@trivia.box</p>
          </section>
        </div>
      </div>
    </div>
  );
}