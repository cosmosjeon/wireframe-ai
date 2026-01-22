/**
 * Header Component
 * Design Philosophy: Excalidraw Sketchy Minimalism
 * - Minimal navigation with VibeFrame logo
 * - Sketchy border styling
 * - Black and white color scheme
 */

export default function Header() {
  return (
    <header className="sticky top-0 z-50 bg-white border-b-2 border-black">
      <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <img
            src="/images/vibeframe-logo.png"
            alt="VibeFrame"
            className="h-10 w-auto"
          />
        </div>

        {/* Navigation */}
        <nav className="hidden md:flex items-center gap-8">
          <a href="#features" className="text-sm font-semibold hover:text-gray-600 transition-colors">
            Features
          </a>
          <a href="#how-it-works" className="text-sm font-semibold hover:text-gray-600 transition-colors">
            How It Works
          </a>
          <a href="#pricing" className="text-sm font-semibold hover:text-gray-600 transition-colors">
            Pricing
          </a>
        </nav>

        {/* CTA Button */}
        <button className="hidden sm:block px-6 py-2 bg-black text-white text-sm font-semibold border-2 border-black hover:bg-gray-900 transition-colors">
          Sign In
        </button>
      </div>
    </header>
  );
}
