const endpoint = process.env.GEN_SPEC_URL || "http://localhost:3000/api/items/gen-spec";

const payload = {
  name: "แก้วกรวยกระดาษสีเขียว",
  purpose: "ใช้งานในสำนักงาน",
  style: "medium"
};

const run = async () => {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || "request failed");
  }

  const lines = String(data.spec || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  console.log("Spec output:\n");
  console.log(data.spec);
  console.log("\nLine count:", lines.length);

  const hasPriceHint = /(บาท|ราคา|฿|\d+\s*บาท)/.test(data.spec);
  const hasBrandHint = /(รุ่น|ยี่ห้อ|brand|model)/i.test(data.spec);

  console.log("Contains price hint:", hasPriceHint);
  console.log("Contains brand hint:", hasBrandHint);
};

run().catch((error) => {
  console.error("test-gen-spec error:", error.message);
  process.exit(1);
});
