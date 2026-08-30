export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      error: "فقط درخواست POST مجاز است."
    });
  }

  try {
    const { image, text, clarification } = req.body || {};

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error: "کلید OpenAI روی سرور تنظیم نشده است."
      });
    }

    const hasValidImage =
      typeof image === "string" &&
      /^data:image\/(jpeg|jpg|png|webp);base64,/.test(image);

    const hasValidText =
      typeof text === "string" &&
      text.trim().length > 0;

    const hasClarification =
      typeof clarification === "string" &&
      clarification.trim().length > 0;

    if (!hasValidImage && !hasValidText) {
      return res.status(400).json({
        error: "عکس یا توضیح معتبر غذا ارسال نشده است."
      });
    }

    if (hasValidImage && image.length > 4_000_000) {
      return res.status(413).json({
        error: "حجم تصویر زیاد است. لطفاً تصویر کوچکتری انتخاب کنید."
      });
    }

    const prompt = `
You are the food-analysis system for My Future Self (MFS).

Analyze the user's food from the available image and/or text description.
If both are provided, use both together.
If the user provides clarification or correction, treat it as higher-priority information.

User food description:
${hasValidText ? text.trim() : "No text description provided"}

User clarification/correction:
${hasClarification ? clarification.trim() : "No clarification provided"}

Rules:
- Never present estimates as exact measurements.
- Account for ingredients, portion sizes, sauces, oils, and preparation method.
- Mention important assumptions.
- If the image is unclear or the description is incomplete, lower the confidence level.
- If it is not food, set is_food to false.
- Write meal_name, item names, portions, assumptions, and clarification_question in Persian.
- Return total calories, protein, carbohydrates, fat, and fiber.
- Do not give medical advice.
- Do not shame or judge the user.
`.trim();

    const content = [
      {
        type: "input_text",
        text: prompt
      }
    ];

    if (hasValidImage) {
      content.push({
        type: "input_image",
        image_url: image
      });
    }

    const openAIResponse = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: "gpt-5-mini",
          input: [
            {
              role: "user",
              content
            }
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
                    type: "boolean"
                  },

                  meal_name: {
                    type: "string"
                  },

                  items: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        name: {
                          type: "string"
                        },
                        portion: {
                          type: "string"
                        },
                        calories: {
                          type: "number"
                        },
                        protein_g: {
                          type: "number"
                        },
                        carbs_g: {
                          type: "number"
                        },
                        fat_g: {
                          type: "number"
                        },
                        fiber_g: {
                          type: "number"
                        }
                      },
                      required: [
                        "name",
                        "portion",
                        "calories",
                        "protein_g",
                        "carbs_g",
                        "fat_g",
                        "fiber_g"
                      ]
                    }
                  },

                  totals: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      calories: {
                        type: "number"
                      },
                      protein_g: {
                        type: "number"
                      },
                      carbs_g: {
                        type: "number"
                      },
                      fat_g: {
                        type: "number"
                      },
                      fiber_g: {
                        type: "number"
                      }
                    },
                    required: [
                      "calories",
                      "protein_g",
                      "carbs_g",
                      "fat_g",
                      "fiber_g"
                    ]
                  },

                  confidence: {
                    type: "string",
                    enum: ["low", "medium", "high"]
                  },

                  assumptions: {
                    type: "array",
                    items: {
                      type: "string"
                    }
                  },

                  clarification_question: {
                    anyOf: [
                      {
                        type: "string"
                      },
                      {
                        type: "null"
                      }
                    ]
                  }
                },

                required: [
                  "is_food",
                  "meal_name",
                  "items",
                  "totals",
                  "confidence",
                  "assumptions",
                  "clarification_question"
                ]
              }
            }
          }
        })
      }
    );

    const rawResponse = await openAIResponse.text();

    let responseData;

    try {
      responseData = rawResponse
        ? JSON.parse(rawResponse)
        : null;
    } catch (error) {
      console.error("OpenAI returned invalid JSON:", rawResponse);

      return res.status(502).json({
        error: "پاسخ معتبر از سرویس تحلیل دریافت نشد."
      });
    }

    if (!openAIResponse.ok) {
      console.error("OpenAI API error:", responseData);

      return res.status(502).json({
        error:
          responseData?.error?.message ||
          "تحلیل غذا انجام نشد. لطفاً دوباره تلاش کنید."
      });
    }

    const outputText =
      responseData?.output_text ||
      responseData?.output
        ?.flatMap(item => item.content || [])
        .find(item => item.type === "output_text")
        ?.text;

    if (!outputText) {
      return res.status(502).json({
        error: "نتیجه تحلیل کامل دریافت نشد."
      });
    }

    let analysis;

    try {
      analysis =
        typeof outputText === "string"
          ? JSON.parse(outputText)
          : outputText;
    } catch (error) {
      console.error("Structured output parse error:", outputText);

      return res.status(502).json({
        error: "نتیجه تحلیل قابل خواندن نبود."
      });
    }

    return res.status(200).json(analysis);

  } catch (error) {
    console.error("analyze-food error:", error);

    return res.status(500).json({
      error: "خطای داخلی سرور رخ داد."
    });
  }
}