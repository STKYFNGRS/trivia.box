'use client';

import { ArrowTopRightIcon } from '@radix-ui/react-icons';
import NextLink from 'next/link';
import { NavbarLink } from '@/components/layout/header/Navbar';
import FooterIcon from './FooterIcon';

export default function Footer() {
  return (
    <footer className="flex flex-1 flex-col justify-end">
      <div className="flex flex-col justify-between gap-16 bg-boat-footer-dark-gray py-12">
        <div className="container mx-auto flex w-full flex-col justify-between gap-16 px-8 md:flex-row">
          <div className="flex flex-col justify-between">
            <div className="flex h-8 items-center justify-start gap-4">
              <NextLink href="/" passHref className="relative h-8 w-8" aria-label="Home page">
                <FooterIcon />
              </NextLink>
              <NextLink
                href="/"
                passHref
                className="font-robotoMono text-center text-xl font-medium text-white no-underline"
              >
                Trivia.Box
              </NextLink>
            </div>

            <div className="mt-8 flex flex-col items-center justify-center">
            <p>
              &copy; {new Date().getFullYear()} ❤️ STKYFNGRS. All rights reserved.
            </p>
            </div>
          </div>

          <div className="font-robotoMono flex flex-col items-start justify-center gap-4 text-center text-xl font-medium text-white">
            EXPERIENCES
            <NavbarLink href="/buy-me-coffee">
              <span className="flex items-center gap-1 px-2">
                Buy Me Coffee <ArrowTopRightIcon width="16" height="16" />
              </span>
            </NavbarLink>
            <NavbarLink href="/mint">
              <span className="flex items-center gap-1 px-2">
                Mint NFT <ArrowTopRightIcon width="16" height="16" />
              </span>
            </NavbarLink>
            <NavbarLink href="/paymaster-bundler">
              <span className="flex items-center gap-1 px-2">
                Paymaster Bundler <ArrowTopRightIcon width="16" height="16" />
              </span>
            </NavbarLink>
          </div>
        </div>
      </div>
    </footer>
  );
}
