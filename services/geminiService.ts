
import { GoogleGenAI, Type } from "@google/genai";
import { ThemeConfig, BlockColor } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateThemeConfig = async (userPrompt: string): Promise<{ config: ThemeConfig, imagePrompt: string }> => {
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Act as a master game UI/UX designer. Create a COMPLETE game theme for: "${userPrompt}". 
    
    STRICT ICON RULES:
    1. "icons": You MUST only use SINGLE, HIGH-VISIBILITY EMOJIS. 
    2. ABSOLUTELY NO TEXT, NO COUNTRY CODES (like 'de', 'tr', 'us'), NO LETTERS.
    3. If theme is "Germany", use: 🥨, 🏰, ⚽, 🍺, 🚗, 🌲.
    4. Each color must have a unique, distinct emoji that fits the vibe.
    
    STRICT STYLE RULES:
    - "gradients": Vibrant, modern Tailwind CSS color pairs.
    - "imagePrompt": A breathtaking, high-quality cinematic background prompt.
    
    Return a valid JSON object.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          icons: {
            type: Type.OBJECT,
            properties: {
              pink: { type: Type.STRING },
              cyan: { type: Type.STRING },
              lime: { type: Type.STRING },
              orange: { type: Type.STRING },
              purple: { type: Type.STRING },
              yellow: { type: Type.STRING },
            },
            required: ["pink", "cyan", "lime", "orange", "purple", "yellow"]
          },
          gradients: {
            type: Type.OBJECT,
            properties: {
              pink: { type: Type.STRING },
              cyan: { type: Type.STRING },
              lime: { type: Type.STRING },
              orange: { type: Type.STRING },
              purple: { type: Type.STRING },
              yellow: { type: Type.STRING },
            },
            required: ["pink", "cyan", "lime", "orange", "purple", "yellow"]
          },
          imagePrompt: { type: Type.STRING }
        },
        required: ["icons", "gradients", "imagePrompt"]
      }
    }
  });

  const result = JSON.parse(response.text);
  return {
    config: {
      name: userPrompt,
      icons: result.icons,
      gradients: result.gradients
    },
    imagePrompt: result.imagePrompt
  };
};

export const generateGameBackground = async (prompt: string, currentImageBase64?: string): Promise<string> => {
  try {
    const contents = currentImageBase64 ? {
      parts: [
        { inlineData: { data: currentImageBase64.split(',')[1], mimeType: 'image/png' } },
        { text: `Re-style this game background for: ${prompt}. Cinematic, wide-angle, hyper-realistic, neon elements, 8k.` }
      ]
    } : {
      parts: [{ text: `A professional, breathtaking 4k game background. Topic: ${prompt}. Artistic, vibrant, gaming aesthetic.` }]
    };

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: contents,
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    throw new Error("No image data");
  } catch (error) {
    console.error("Image Gen Error:", error);
    return "https://images.unsplash.com/photo-1614850523296-d8c1af93d400?auto=format&fit=crop&q=80&w=1000";
  }
};
