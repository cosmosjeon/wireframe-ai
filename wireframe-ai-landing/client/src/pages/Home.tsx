import { Button } from "@/components/ui/button";
import { ArrowRight, Zap, Cog, CheckCircle2, Wand2 } from "lucide-react";
import { useEffect, useState } from "react";
import Header from "@/components/Header";

/**
 * VibeFrame Landing Page
 * Design Philosophy: Excalidraw Sketchy Minimalism
 * - Hand-drawn, imperfect aesthetic
 * - Monochromatic color scheme (black, white, gray)
 * - Caveat font for headings, Inter for body
 * - Sketch-first mentality with "work-in-progress" feeling
 */

export default function Home() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  return (
    <div className="min-h-screen bg-white text-foreground">
      <Header />
      {/* Hero Section */}
      <section className="min-h-screen flex items-center justify-center px-4 py-20 pt-32">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Left: Text Content */}
          <div
            className={`transition-all duration-1000 ${
              isVisible ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-10"
            }`}
          >
            <h1 className="text-6xl lg:text-7xl font-bold mb-6 leading-tight">
              Turn Your Ideas Into
              <span className="block text-black mt-2">Perfect Wireframes</span>
            </h1>
            <p className="text-xl text-gray-600 mb-8 leading-relaxed max-w-lg">
              VibeFrame transforms your ideas into professional wireframes in seconds. Upload a sketch, describe your vision, or paste a screenshot—our AI handles the rest.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <button className="sketchy-button">
                Get Started Free
              </button>
              <button className="px-6 py-3 border-2 border-black text-black font-semibold hover:bg-gray-50 transition-colors">
                Watch Demo
              </button>
            </div>
            <p className="text-sm text-gray-500 mt-8">
              ✓ No credit card required • ✓ 10 free wireframes • ✓ Export as PNG, SVG, or Figma
            </p>
          </div>

          {/* Right: Hero Illustration */}
          <div
            className={`transition-all duration-1000 delay-200 ${
              isVisible ? "opacity-100 translate-x-0" : "opacity-0 translate-x-10"
            }`}
          >
            <div className="sketchy-card">
              <img
                src="/images/hero-wireframe.png"
                alt="Wireframe example"
                className="w-full h-auto"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-4 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-5xl lg:text-6xl font-bold mb-4">
              Why Designers Love VibeFrame
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Built by designers, for designers. VibeFrame understands your workflow.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Feature 1 */}
            <div className="sketchy-card group hover:shadow-lg transition-shadow">
              <div className="mb-4 h-16 w-16 flex items-center justify-center bg-gray-100 sketchy-border">
                <Wand2 className="w-8 h-8 text-black" />
              </div>
              <h3 className="text-2xl font-bold mb-3">VibeFrame AI</h3>
              <p className="text-gray-600">
                Advanced AI that understands design intent from any input and creates perfect wireframes.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="sketchy-card group hover:shadow-lg transition-shadow">
              <div className="mb-4 h-16 w-16 flex items-center justify-center bg-gray-100 sketchy-border">
                <Zap className="w-8 h-8 text-black" />
              </div>
              <h3 className="text-2xl font-bold mb-3">Lightning Fast</h3>
              <p className="text-gray-600">
                Generate complete wireframes in seconds, not hours.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="sketchy-card group hover:shadow-lg transition-shadow">
              <div className="mb-4 h-16 w-16 flex items-center justify-center bg-gray-100 sketchy-border">
                <Cog className="w-8 h-8 text-black" />
              </div>
              <h3 className="text-2xl font-bold mb-3">Fully Editable</h3>
              <p className="text-gray-600">
                Fine-tune every element. Your wireframe, your rules.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="sketchy-card group hover:shadow-lg transition-shadow">
              <div className="mb-4 h-16 w-16 flex items-center justify-center bg-gray-100 sketchy-border">
                <CheckCircle2 className="w-8 h-8 text-black" />
              </div>
              <h3 className="text-2xl font-bold mb-3">Export Ready</h3>
              <p className="text-gray-600">
                PNG, SVG, Figma, or code. Choose your format.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-5xl lg:text-6xl font-bold mb-4">
              Three Steps to Perfect Wireframes
            </h2>
          </div>

          <div className="flex flex-col lg:flex-row items-center justify-between gap-8">
            {/* Step 1 */}
            <div className="flex-1 text-center">
              <div className="mb-6 flex justify-center">
                <div className="sketchy-card w-32 h-32 flex items-center justify-center">
                  <div className="text-4xl font-bold">1</div>
                </div>
              </div>
              <h3 className="text-2xl font-bold mb-3">Upload</h3>
              <p className="text-gray-600">
                Share a sketch, screenshot, or describe your idea. Any format works.
              </p>
            </div>

            {/* Arrow */}
            <div className="hidden lg:flex items-center justify-center">
              <ArrowRight className="w-8 h-8 text-gray-400 rotate-0" />
            </div>

            {/* Step 2 */}
            <div className="flex-1 text-center">
              <div className="mb-6 flex justify-center">
                <div className="sketchy-card w-32 h-32 flex items-center justify-center">
                  <div className="text-4xl font-bold">2</div>
                </div>
              </div>
              <h3 className="text-2xl font-bold mb-3">AI Generates</h3>
              <p className="text-gray-600">
                Our AI analyzes your input and creates professional wireframes instantly.
              </p>
            </div>

            {/* Arrow */}
            <div className="hidden lg:flex items-center justify-center">
              <ArrowRight className="w-8 h-8 text-gray-400" />
            </div>

            {/* Step 3 */}
            <div className="flex-1 text-center">
              <div className="mb-6 flex justify-center">
                <div className="sketchy-card w-32 h-32 flex items-center justify-center">
                  <div className="text-4xl font-bold">3</div>
                </div>
              </div>
              <h3 className="text-2xl font-bold mb-3">Download</h3>
              <p className="text-gray-600">
                Export in your preferred format and start designing.
              </p>
            </div>
          </div>

          {/* Process Diagram */}
          <div className="mt-16 flex justify-center">
            <div className="sketchy-card max-w-2xl w-full">
              <img
                src="/images/process-diagram.png"
                alt="Process flow diagram"
                className="w-full h-auto"
              />
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 bg-black text-white">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-5xl lg:text-6xl font-bold mb-6">
            Ready to Ship Faster with VibeFrame?
          </h2>
          <p className="text-xl text-gray-300 mb-10 max-w-2xl mx-auto">
            Join thousands of designers using VibeFrame to create wireframes in seconds.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button className="px-8 py-4 bg-white text-black font-bold text-lg border-2 border-white hover:bg-gray-100 transition-colors">
              Start Creating Now
            </button>
            <button className="px-8 py-4 border-2 border-white text-white font-bold text-lg hover:bg-white hover:text-black transition-colors">
              View Pricing
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 bg-gray-900 text-gray-400 text-sm border-t-2 border-black">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
            {/* Logo Section */}
            <div className="md:col-span-4 mb-8 pb-8 border-b border-gray-700">
              <img
                src="/images/vibeframe-logo-icon.png"
                alt="VibeFrame"
                className="h-8 w-auto"
              />
            </div>
            <div className="md:col-span-1">
              <h4 className="text-white font-bold mb-4">Product</h4>
              <ul className="space-y-2">
                <li><a href="#" className="hover:text-white transition-colors">Features</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Pricing</a></li>
                <li><a href="#" className="hover:text-white transition-colors">FAQ</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-bold mb-4">Company</h4>
              <ul className="space-y-2">
                <li><a href="#" className="hover:text-white transition-colors">About</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Blog</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Careers</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-bold mb-4">Legal</h4>
              <ul className="space-y-2">
                <li><a href="#" className="hover:text-white transition-colors">Privacy</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Terms</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-bold mb-4">Connect</h4>
              <ul className="space-y-2">
                <li><a href="#" className="hover:text-white transition-colors">Twitter</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Discord</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Email</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-700 pt-8 text-center">
            <p>&copy; 2026 VibeFrame. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
