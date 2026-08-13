type Extraction = {
  holdings: Array<{ name: string; symbol: string | null; quantity: number | null; average_price: number | null }>;
};

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return Response.json({ error: "이미지 분석용 OpenAI API 키가 설정되지 않았습니다." }, { status: 503 });
  const { image, accountType } = await request.json() as { image?: string; accountType?: string };
  if (typeof image !== "string" || !image.startsWith("data:image/") || image.length > 9_000_000) {
    return Response.json({ error: "지원하지 않는 이미지입니다. 6MB 이하의 PNG 또는 JPG를 선택해 주세요." }, { status: 400 });
  }
  const prompt = `You extract a brokerage MTS holdings screenshot. Account type: ${accountType ?? "unknown"}. Return only holdings that are visibly present. Extract company/asset name, ticker or six-digit Korean code if visible, quantity, and average purchase price. Never infer missing values. Numbers must be plain numbers, no currency separators.`;
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o",
      input: [{ role: "user", content: [{ type: "input_text", text: prompt }, { type: "input_image", image_url: image, detail: "high" }] }],
      text: { format: { type: "json_schema", name: "mts_holdings", strict: true, schema: { type: "object", additionalProperties: false, properties: { holdings: { type: "array", items: { type: "object", additionalProperties: false, properties: { name: { type: "string" }, symbol: { type: ["string", "null"] }, quantity: { type: ["number", "null"] }, average_price: { type: ["number", "null"] } }, required: ["name", "symbol", "quantity", "average_price"] } } }, required: ["holdings"] } } },
    }),
  });
  if (!response.ok) return Response.json({ error: "이미지 분석에 실패했습니다. 잠시 후 다시 시도해 주세요." }, { status: 502 });
  const result = await response.json() as { output_text?: string };
  try { return Response.json(JSON.parse(result.output_text ?? "") as Extraction); }
  catch { return Response.json({ error: "분석 결과 형식을 읽지 못했습니다." }, { status: 502 }); }
}
