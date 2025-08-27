// api/chat.js - Endpoint principal del chatbot
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const { message, model, search_web } = req.body;

    // System prompts para cada modelo
    const SYSTEM_PROMPTS = {
      'orzion-pro': "Eres Orzion Pro, un asistente de IA avanzado especializado en razonamiento profundo y búsqueda de información. Desarrollado por Dylan Orzatty para OrzattyStudios.",
      'orzion-turbo': "Eres Orzion Turbo, diseñado para respuestas rápidas y uso de herramientas. Desarrollado por Dylan Orzatty para OrzattyStudios.",
      'orzion-mini': "Eres Orzion Mini, eficiente y multimodal. Desarrollado por Dylan Orzatty para OrzattyStudios.",
      'orzion-imagen': "Eres Orzion Imagen, especializado en generar imágenes a partir de prompts. Desarrollado por Dylan Orzatty para OrzattyStudios."
    };

    // Map de modelos de OpenRouter
    const OPENROUTER_MODELS = {
      'orzion-pro': 'deepseek/deepseek-r1-0528:free',
      'orzion-turbo': 'openai/gpt-oss-20b:free',
      'orzion-mini': 'google/gemma-3n-e2b-it:free',
      'orzion-imagen': 'google/gemini-2.5-flash-image-preview:free'
    };

    // Verificar que el modelo sea válido
    if (!OPENROUTER_MODELS[model]) {
      return res.status(400).json({ error: 'Modelo no válido' });
    }

    let finalMessage = message;

    // Función de búsqueda web integrada
    async function googleSearch(query) {
      try {
        const apiKey = process.env.google_search_api_key;
        const cx = process.env.google_cse_id;
        const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(query)}`;
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.items) {
          return data.items.slice(0, 3).map(item => ({
            title: item.title,
            snippet: item.snippet,
            link: item.link
          }));
        }
        return [];
      } catch (error) {
        console.error('Error en búsqueda:', error);
        return [];
      }
    }

    // Si se solicita búsqueda web
    if (search_web && model !== 'orzion-imagen') {
      const searchResults = await googleSearch(message);
      if (searchResults.length > 0) {
        const context = searchResults.map(result => 
          `- ${result.title}: ${result.snippet} (Fuente: ${result.link})`
        ).join('\n');
        finalMessage = `Contexto de búsqueda actual:\n${context}\n\nPregunta del usuario: ${message}`;
      }
    }

    const openRouterModel = OPENROUTER_MODELS[model];

    // Para el modelo de imágenes
    if (model === 'orzion-imagen') {
      const response = await fetch('https://openrouter.ai/api/v1/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.openrouter_api_key}`
        },
        body: JSON.stringify({
          model: openRouterModel,
          prompt: finalMessage,
          n: 1,
          size: '1024x1024'
        })
      });

      const data = await response.json();
      return res.status(200).json({ 
        type: 'image',
        image_url: data.data[0].url 
      });
    }

    // Para modelos de chat
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.openrouter_api_key}`
      },
      body: JSON.stringify({
        model: openRouterModel,
        messages: [
          { role: 'system', content: SYSTEM_PROMPTS[model] },
          { role: 'user', content: finalMessage }
        ],
        max_tokens: 1000
      })
    });

    const data = await response.json();
    
    if (data.error) {
      throw new Error(data.error.message);
    }

    res.status(200).json({ 
      type: 'text',
      message: data.choices[0].message.content 
    });
    
  } catch (error) {
    console.error('Error en chat:', error);
    res.status(500).json({ error: 'Error interno del servidor: ' + error.message });
  }
}