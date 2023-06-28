import {
  ArrowPathIcon,
  ChevronRightIcon,
  CloudArrowUpIcon,
  LockClosedIcon,
  ServerIcon,
} from "@heroicons/react/20/solid";
import Footer from "../Footer";
import Nav from "../Nav";
import PricingSection from "./PricingSection";

export default function Example() {
  return (
    <div className="bg-white">
      {/* Header */}
      <Nav />
      <main>
        <PricingSection />
      </main>

      <Footer />
    </div>
  );
}
