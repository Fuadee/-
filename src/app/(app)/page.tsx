import { Suspense } from "react";

import GenerateClient from "./GenerateClient";

export default function HomePage() {
  return (
    <Suspense fallback={<div className="p-6">Loading...</div>}>
      <GenerateClient />
    </Suspense>
  );
}
