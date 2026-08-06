
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      error: "فقط درخواست POST مجاز است.",
    });
  }

  try {
    const { image } = req.body || {};

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error: "کلید OpenAI روی سرور تنظیم نشده است.",
      });
    }

    if (
      typeof image !== "string" ||
      !/^data:image\/(jpeg|jpg|png|webp);base64,/.test(image)
    ) {
      return res.status(400).json({
        error: "یک تصویر معتبر ارسال نشده است.",
      });
    }

    // حدود 3 مگابایت؛ تصویر بزرگ‌تر در مرحله رابط کاربری کوچک می‌شود.
    if (image.length > 4_000_000) {
      return res.status(413).json({
        error: "حجم تصویر زیاد است. لطفاً تصویر کوچک‌تری انتخاب کنید.",
      });
    }

    const openAIResponse = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-5-mini",

          input: [
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: `
You are the food-photo analysis system for My Future Self (MFS).

Analyze the food visible in the image and provide cautious nutritional estimates.

Rules:
- Never present estimates as exact measurements.
- Account for visible ingredients, portion sizes, sauces, oils, and preparation method.
- Mention important assumptions.
- If the image is unclear, lower the confidence level.
- If it is not food, set is_food to false.
- Write meal_name, item names, portions, assumptions, and clarification_question in Persian.
- Return total calories, protein, carbohydrates, fat, and fiber.
- Do not give medical advice.
- Do not shame or judge the user.
                  `.trim(),
                },
                {
                  type: "input_image",
                  image_url: image,
                },
              ],
            },
          ],

          text: {
            format: {
              type: "json_schema",
              name: "food_analysis",
              strict: true,
              schema: {
                type: "object",
                additionalProperties: false,

                properties: {
                  is_food: {
                    type: "boolean",
                  },

                  meal_name: {
                    type: "string",
                  },

                  items: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,

                      properties: {
                        name: {
                          type: "string",
                        },
                        portion: {
                          type: "string",
                        },
                        calories: {
                          type: "number",
                        },
                        protein_g: {
                          type: "number",
                        },
                        carbs_g: {
                          type: "number",
                        },
                        fat_g: {
                          type: "number",
                        },
                        fiber_g: {
                          type: "number",
                        },
                      },

                      required: [
                        "name",
                        "portion",
                        "calories",
                        "protein_g",
                        "carbs_g",
                        "fat_g",
                        "fiber_g",
                      ],
                    },
                  },

                  totals: {
                    type: "object",
                    additionalProperties: false,

                    properties: {
                      calories: {
                        type: "number",
                      },
                      protein_g: {
                        type: "number",
                      },
                      carbs_g: {
                        type: "number",
                      },
                      fat_g: {
                        type: "number",
                      },
                      fiber_g: {
                        type: "number",
                      },
                    },

                    required: [
                      "calories",
                      "protein_g",
                      "carbs_g",
                      "fat_g",
                      "fiber_g",
                    ],
                  },

                  confidence: {
                    type: "string",
                    enum: ["low", "medium", "high"],
                  },

                  assumptions: {
                    type: "array",
                    items: {
                      type: "string",
                    },
                  },

                  clarification_question: {
                    anyOf: [
                      {
                        type: "string",
                      },
                      {
                        type: "null",
                      },
                    ],
                  },
                },

                required: [
                  "is_food",
                  "meal_name",
                  "items",
                  "totals",
                  "confidence",
                  "assumptions",
                  "clarification_question",
                ],
              },
            },
          },
        }),
      }
    );

    const responseData = await openAIResponse.json();

    if (!openAIResponse.ok) {
      console.error("OpenAI API error:", responseData);

      return res.status(openAIResponse.status).json({
        error: "تحلیل تصویر انجام نشد. لطفاً دوباره تلاش کنید.",
      });
    }

    const outputText = responseData.output
      ?.flatMap((item) => item.content || [])
      .find((item) => item.type === "output_text")?.text;

    if (!outputText) {
      throw new Error("No structured output returned by OpenAI.");
    }

    const analysis = JSON.parse(outputText);

    return res.status(200).json(analysis);
  } catch (error) {
    console.error("analyze-food error:", error);

    return res.status(500).json({
      error: "خطای داخلی سرور رخ داد.",
    });
  }
}