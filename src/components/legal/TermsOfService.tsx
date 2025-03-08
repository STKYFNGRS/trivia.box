import React from 'react';

interface TermsOfServiceProps {
  onClose: () => void;
}

export default function TermsOfService({ onClose }: TermsOfServiceProps) {
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

        <h2 className="text-2xl font-bold text-amber-500 mb-6">Terms of Service</h2>
        
        <div className="text-gray-300 space-y-6">
          <p>Last Updated: March 7, 2025</p>
          
          <section className="space-y-3">
            <h3 className="text-lg font-semibold text-amber-400">1. Agreement to Terms</h3>
            <p>
              By accessing or using Trivia.Box, you agree to be bound by these Terms of Service (&quot;Terms&quot;). 
              If you disagree with any part of the Terms, you may not access the service.
            </p>
          </section>
          
          <section className="space-y-3">
            <h3 className="text-lg font-semibold text-amber-400">2. Description of Service</h3>
            <p>
              Trivia.Box is a web3 trivia game platform that allows users to answer trivia questions, 
              compete globally, and earn rewards in the form of tokens and NFTs.
            </p>
          </section>
          
          <section className="space-y-3">
            <h3 className="text-lg font-semibold text-amber-400">3. Eligibility</h3>
            <p>
              Trivia.Box is appropriate for users of all ages. By using the service, you represent and 
              warrant that you have the legal capacity to enter into a binding agreement, or you have 
              obtained parental or guardian consent if required in your jurisdiction.
            </p>
          </section>

          <section className="space-y-3">
            <h3 className="text-lg font-semibold text-amber-400">4. User Accounts</h3>
            <p>
              To use certain features of the service, you must connect your web3 wallet. You are responsible for 
              maintaining the security of your wallet and all activities that occur in connection with your account.
            </p>
            <p>
              You agree to:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Provide accurate and complete information</li>
              <li>Keep your wallet secure</li>
              <li>Not share your wallet credentials with others</li>
              <li>Notify us immediately of any unauthorized use or security breach</li>
            </ul>
          </section>
          
          <section className="space-y-3">
            <h3 className="text-lg font-semibold text-amber-400">5. Intellectual Property</h3>
            <p>
              The content, features, and functionality of Trivia.Box, including but not limited to text, graphics, 
              logos, icons, images, audio clips, digital downloads, and software, are owned by Dude dot box LLC and 
              are protected by copyright, trademark, and other intellectual property laws.
            </p>
          </section>
          
          <section className="space-y-3">
            <h3 className="text-lg font-semibold text-amber-400">6. User Conduct</h3>
            <p>
              You agree not to use the service to:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Violate any applicable laws or regulations</li>
              <li>Infringe upon the rights of others</li>
              <li>Engage in unauthorized or automated access to the service</li>
              <li>Manipulate game outcomes or use cheating mechanisms</li>
              <li>Distribute malware or harmful code</li>
              <li>Interfere with the proper functioning of the service</li>
              <li>Collect user information without consent</li>
            </ul>
          </section>
          
          <section className="space-y-3">
            <h3 className="text-lg font-semibold text-amber-400">7. Rewards and Tokens</h3>
            <p>
              Trivia.Box offers rewards in the form of tokens and NFTs. The distribution of rewards is subject to our 
              reward policies and may be changed at any time. Rewards have no cash value unless explicitly stated.
            </p>
            <p>
              You acknowledge that:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>The value of tokens and NFTs may fluctuate</li>
              <li>We make no guarantees regarding the future value of rewards</li>
              <li>Blockchain transactions are irreversible</li>
              <li>Gas fees and transaction costs are your responsibility</li>
            </ul>
          </section>
          
          <section className="space-y-3">
            <h3 className="text-lg font-semibold text-amber-400">8. Limitation of Liability</h3>
            <p>
              To the maximum extent permitted by law, Dude dot box LLC shall not be liable for any indirect, 
              incidental, special, consequential, or punitive damages resulting from your use or inability to use 
              the service, including but not limited to loss of profits, data, or goodwill.
            </p>
          </section>
          
          <section className="space-y-3">
            <h3 className="text-lg font-semibold text-amber-400">9. Disclaimers</h3>
            <p>
              The service is provided on an &quot;as is&quot; and &quot;as available&quot; basis without warranties of any kind, 
              either express or implied. We do not guarantee that the service will be uninterrupted, secure, or 
              error-free.
            </p>
            <p>
              Trivia.Box is not responsible for any errors in trivia questions or answers.
            </p>
          </section>
          
          <section className="space-y-3">
            <h3 className="text-lg font-semibold text-amber-400">10. Changes to Terms</h3>
            <p>
              We reserve the right to modify these Terms at any time. We will provide notice of significant changes 
              by posting the updated Terms on this page and updating the &quot;Last Updated&quot; date. Your continued use of 
              the service after such changes constitutes your acceptance of the new Terms.
            </p>
          </section>
          
          <section className="space-y-3">
            <h3 className="text-lg font-semibold text-amber-400">11. Governing Law</h3>
            <p>
              These Terms shall be governed by and construed in accordance with the laws of [Your Jurisdiction], 
              without regard to its conflict of law provisions.
            </p>
          </section>
          
          <section className="space-y-3">
            <h3 className="text-lg font-semibold text-amber-400">12. Contact Information</h3>
            <p>
              If you have any questions about these Terms, please contact us at:
            </p>
            <p className="text-amber-400">host@trivia.box</p>
          </section>
        </div>
      </div>
    </div>
  );
}