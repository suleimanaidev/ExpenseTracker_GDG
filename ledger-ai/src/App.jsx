import Navbar from './components/Navbar.jsx';
import Hero from './components/Hero.jsx';
import Features from './components/Features.jsx';
import Dashboard from './components/Dashboard.jsx';
import AiChat from './components/AiChat.jsx';
import OcrScanner from './components/OcrScanner.jsx';
import Pricing from './components/Pricing.jsx';
import Footer from './components/Footer.jsx';

export default function App() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <Features />
        <Dashboard />
        <AiChat />
        <OcrScanner />
        <Pricing />
      </main>
      <Footer />
    </>
  );
}
