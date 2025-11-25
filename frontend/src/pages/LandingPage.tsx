import { Link } from "react-router-dom";
import { FolderKanban, Video, Brain, TrendingUp, Users, Lock } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <FolderKanban className="h-6 w-6 text-blue-600" />
            <span className="text-xl font-bold">Qualitative Research Tool</span>
          </div>
          <Link
            to="/sign-in"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors inline-block"
          >
            Sign In
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-20">
        <div className="text-center max-w-3xl mx-auto">
          <h1 className="text-5xl font-bold text-gray-900 mb-6">
            AI-Powered Qualitative Research Analysis
          </h1>
          <p className="text-xl text-gray-600 mb-8">
            Transform video interviews into actionable insights using advanced AI analysis.
            Extract patterns, generate design principles, and unlock deep understanding from your research data.
          </p>
          <Link
            to="/sign-in"
            className="px-8 py-4 bg-blue-600 text-white text-lg font-semibold rounded-lg hover:bg-blue-700 transition-colors shadow-lg inline-block"
          >
            Get Started
          </Link>
        </div>
      </section>

      {/* Features Section */}
      <section className="container mx-auto px-4 py-16">
        <div className="grid md:grid-cols-3 gap-8">
          <div className="bg-white p-8 rounded-xl shadow-md">
            <Video className="h-12 w-12 text-blue-600 mb-4" />
            <h3 className="text-xl font-semibold mb-2">Video Analysis</h3>
            <p className="text-gray-600">
              Upload video interviews and automatically transcribe them with speaker identification.
            </p>
          </div>

          <div className="bg-white p-8 rounded-xl shadow-md">
            <Brain className="h-12 w-12 text-blue-600 mb-4" />
            <h3 className="text-xl font-semibold mb-2">AI-Powered Insights</h3>
            <p className="text-gray-600">
              Our 5-step analysis process extracts meaning, patterns, and actionable design principles.
            </p>
          </div>

          <div className="bg-white p-8 rounded-xl shadow-md">
            <TrendingUp className="h-12 w-12 text-blue-600 mb-4" />
            <h3 className="text-xl font-semibold mb-2">Cross-Video Patterns</h3>
            <p className="text-gray-600">
              Identify meta-patterns and system-level insights across multiple interviews.
            </p>
          </div>
        </div>
      </section>

      {/* Process Section */}
      <section className="bg-gray-50 py-16 mt-16">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12">5-Step Analysis Process</h2>
          <div className="grid md:grid-cols-5 gap-4">
            {[
              { step: 1, name: "CHUNK", desc: "Break into segments" },
              { step: 2, name: "INFER", desc: "Extract meaning" },
              { step: 3, name: "RELATE", desc: "Find patterns" },
              { step: 4, name: "EXPLAIN", desc: "Generate insights" },
              { step: 5, name: "ACTIVATE", desc: "Design principles" },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="bg-blue-600 text-white w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 font-bold">
                  {item.step}
                </div>
                <h4 className="font-semibold mb-1">{item.name}</h4>
                <p className="text-sm text-gray-600">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Security Section */}
      <section className="container mx-auto px-4 py-16">
        <div className="bg-blue-50 p-8 rounded-xl">
          <div className="flex items-center gap-4 mb-4">
            <Lock className="h-8 w-8 text-blue-600" />
            <h2 className="text-2xl font-bold">Secure & Private</h2>
          </div>
          <p className="text-gray-700">
            Your research data is protected with enterprise-grade security. All interviews and analyses
            are private to your account and stored securely in the cloud.
          </p>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-4 py-20 text-center">
        <h2 className="text-3xl font-bold mb-4">Ready to Transform Your Research?</h2>
        <p className="text-xl text-gray-600 mb-8">
          Sign in to start analyzing your qualitative research data with AI.
        </p>
        <Link
          to="/sign-in"
          className="px-8 py-4 bg-blue-600 text-white text-lg font-semibold rounded-lg hover:bg-blue-700 transition-colors shadow-lg inline-block"
        >
          Sign In to Continue
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 py-8">
        <div className="container mx-auto px-4 text-center text-gray-600">
          <p>&copy; 2024 Qualitative Research Tool. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}