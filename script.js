// script.js
// AI Idea Generator — application logic
// Uses Google Gemini for idea generation and Supabase (REST API) for storing favorites.

(() => {
  'use strict';

  /* ---------------------------------------------------------
     DOM references
  --------------------------------------------------------- */
  const categorySelect = document.getElementById('category');
  const userInput = document.getElementById('userInput');
  const generateBtn = document.getElementById('generateBtn');
  const errorMessage = document.getElementById('errorMessage');

  const resultsSection = document.getElementById('results');
  const loadingIndicator = document.getElementById('loadingIndicator');
  const loadingText = document.getElementById('loadingText');
  const ideasGrid = document.getElementById('ideasGrid');

  const favoritesGrid = document.getElementById('favoritesGrid');
  const favoritesEmpty = document.getElementById('favoritesEmpty');

  const navToggle = document.getElementById('navToggle');
  const navLinks = document.querySelector('.nav-links');

  const toast = document.getElementById('toast');

  /* ---------------------------------------------------------
     Nav toggle (mobile)
  --------------------------------------------------------- */
  navToggle.addEventListener('click', () => {
    navLinks.classList.toggle('open');
  });

  navLinks.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => navLinks.classList.remove('open'));
  });

  /* ---------------------------------------------------------
     Toast helper
  --------------------------------------------------------- */
  let toastTimer = null;
  function showToast(message) {
    toast.textContent = message;
    toast.hidden = false;
    requestAnimationFrame(() => toast.classList.add('show'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => { toast.hidden = true; }, 300);
    }, 2600);
  }

  /* ---------------------------------------------------------
     Fun rotating loading messages (per category)
  --------------------------------------------------------- */
  const LOADING_LINES = {
    'Project Ideas': [
      'Digging through a mountain of possibilities...',
      'Sketching blueprints in the AI\u2019s head...',
      'Turning "hmm" into "here\u2019s an idea"...',
      'Assembling something worth building...',
    ],
    'Business Ideas': [
      'Running the numbers on genius...',
      'Pitching ideas to an imaginary investor...',
      'Spotting gaps nobody else noticed yet...',
      'Cooking up your next big venture...',
    ],
    'Story Prompt': [
      'Waking up a few fictional characters...',
      'Flipping through infinite plot twists...',
      'Borrowing a page from an untold story...',
      'Setting the scene, one word at a time...',
    ],
    'Gift Ideas': [
      'Wrapping up some thoughtful surprises...',
      'Reading minds — gift-shopping edition...',
      'Sniffing out the perfect present...',
      'Making sure this one gets a smile...',
    ],
    'Dinner Recipes': [
      'Preheating the imagination...',
      'Tossing flavors together in the lab...',
      'Raiding a virtual spice rack...',
      'Simmering something delicious...',
    ],
    default: [
      'Waking up the AI\u2019s imagination...',
      'Turning your idea into ideas...',
      'Connecting a few unexpected dots...',
      'Almost there, hang tight...',
    ],
  };

  let loadingMessageTimer = null;

  function startLoadingMessages(category) {
    const lines = LOADING_LINES[category] || LOADING_LINES.default;
    let index = 0;
    loadingText.textContent = lines[index];

    loadingMessageTimer = setInterval(() => {
      index = (index + 1) % lines.length;
      loadingText.style.animation = 'none';
      // Force reflow so the fade-in animation replays every time.
      void loadingText.offsetWidth;
      loadingText.style.animation = '';
      loadingText.textContent = lines[index];
    }, 1700);
  }

  function stopLoadingMessages() {
    clearInterval(loadingMessageTimer);
    loadingMessageTimer = null;
  }

  /* ---------------------------------------------------------
     Error helper
  --------------------------------------------------------- */
  function showError(message) {
    errorMessage.textContent = message;
    errorMessage.hidden = false;
  }
  function clearError() {
    errorMessage.hidden = true;
    errorMessage.textContent = '';
  }

  /* ---------------------------------------------------------
     Gemini API call
     Docs: https://ai.google.dev/api/generate-content
  --------------------------------------------------------- */
  async function generateIdeasFromAI(category, prompt) {
    const apiKey = CONFIG.GEMINI_API_KEY;
    const model = CONFIG.GEMINI_MODEL || 'gemini-2.5-flash';

    if (!apiKey || apiKey === 'YOUR_GEMINI_API_KEY') {
      throw new Error('Missing Gemini API key. Add it to config.js.');
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const instruction = `You are a creative idea generation engine inside a product called "AI Idea Generator".
Category: "${category}".
User request: "${prompt}".

Generate exactly 3 distinct, concise, creative ideas that fit the category and the user's request.
Each idea should be one clear sentence, no numbering, no markdown.`;

    const body = {
      contents: [
        {
          role: 'user',
          parts: [{ text: instruction }],
        },
      ],
      generationConfig: {
        temperature: 0.9,
        maxOutputTokens: 1024,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'ARRAY',
          items: { type: 'STRING' },
          minItems: 3,
          maxItems: 3,
        },
      },
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Gemini API error (${response.status}). ${errText.slice(0, 150)}`);
    }

    const data = await response.json();
    const parts = data?.candidates?.[0]?.content?.parts || [];
    const rawText = parts
      .filter((p) => !p.thought) // skip internal "thinking" parts some Gemini 3.x models emit
      .map((p) => p.text || '')
      .join('');

    if (!rawText) {
      console.warn('Gemini raw response (no usable text found):', data);
    }

    return parseIdeasFromText(rawText);
  }

  function parseIdeasFromText(rawText) {
    // Strip markdown code fences if the model added them anyway.
    const cleaned = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();

    let ideas = [];
    try {
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) {
        ideas = parsed.map((item) => (typeof item === 'string' ? item : String(item)));
      }
    } catch (_e) {
      // Fallback: split into lines if JSON parsing fails.
      ideas = cleaned
        .split('\n')
        .map((line) => line.replace(/^[\s\d.\-*"]+/, '').replace(/"$/, '').trim())
        .filter(Boolean);
    }

    ideas = ideas.filter(Boolean).slice(0, 3);

    if (ideas.length < 3) {
      console.warn('Gemini raw text that failed to parse into 3 ideas:', rawText);
      throw new Error('AI did not return 3 valid ideas. Please try again.');
    }

    return ideas;
  }

  /* ---------------------------------------------------------
     Supabase REST helpers (no SDK — plain fetch calls)
  --------------------------------------------------------- */
  function supabaseReady() {
    return (
      CONFIG.SUPABASE_URL &&
      CONFIG.SUPABASE_URL !== 'YOUR_SUPABASE_URL' &&
      CONFIG.SUPABASE_KEY &&
      CONFIG.SUPABASE_KEY !== 'YOUR_SUPABASE_ANON_KEY'
    );
  }

  async function saveFavoriteToSupabase(category, idea) {
    if (!supabaseReady()) {
      throw new Error('Supabase is not configured yet. Add your URL and key to config.js.');
    }

    const response = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/favorite_ideas`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: CONFIG.SUPABASE_KEY,
        Authorization: `Bearer ${CONFIG.SUPABASE_KEY}`,
        Prefer: 'return=representation',
      },
      body: JSON.stringify([{ category, idea }]),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Supabase insert failed (${response.status}). ${errText.slice(0, 150)}`);
    }

    const rows = await response.json();
    return rows[0];
  }

  async function fetchFavoritesFromSupabase() {
    if (!supabaseReady()) return [];

    const response = await fetch(
      `${CONFIG.SUPABASE_URL}/rest/v1/favorite_ideas?select=*&order=created_at.desc`,
      {
        headers: {
          apikey: CONFIG.SUPABASE_KEY,
          Authorization: `Bearer ${CONFIG.SUPABASE_KEY}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Could not load favorites (${response.status}).`);
    }

    return response.json();
  }

  /* ---------------------------------------------------------
     Rendering: generated idea cards
  --------------------------------------------------------- */
  function renderIdeaCards(ideas, category) {
    ideasGrid.innerHTML = '';

    ideas.forEach((ideaText, index) => {
      const card = document.createElement('div');
      card.className = 'idea-card';
      card.style.animationDelay = `${index * 0.08}s`;

      card.innerHTML = `
        <span class="idea-number">${index + 1}</span>
        <p class="idea-text"></p>
        <div class="idea-footer">
          <button class="heart-btn" type="button" aria-label="Save to favorites" aria-pressed="false">❤</button>
        </div>
      `;

      card.querySelector('.idea-text').textContent = ideaText;

      const heartBtn = card.querySelector('.heart-btn');
      heartBtn.addEventListener('click', async () => {
        heartBtn.disabled = true;
        try {
          await saveFavoriteToSupabase(category, ideaText);
          heartBtn.classList.add('liked');
          heartBtn.setAttribute('aria-pressed', 'true');
          showToast('Saved to your favorites ❤');
          loadFavorites();
        } catch (err) {
          heartBtn.disabled = false;
          showToast(err.message || 'Could not save that idea. Try again.');
        }
      });

      ideasGrid.appendChild(card);
    });
  }

  /* ---------------------------------------------------------
     Rendering: favorite cards
  --------------------------------------------------------- */
  function formatDate(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  function renderFavorites(favorites) {
    favoritesGrid.innerHTML = '';

    if (!favorites || favorites.length === 0) {
      favoritesEmpty.hidden = false;
      return;
    }
    favoritesEmpty.hidden = true;

    favorites.forEach((fav) => {
      const card = document.createElement('div');
      card.className = 'favorite-card glass';

      card.innerHTML = `
        <div class="badge-row">
          <span class="category-badge"></span>
          <span class="heart-btn liked" aria-hidden="true" style="width:34px;height:34px;font-size:0.95rem;">❤</span>
        </div>
        <p class="favorite-content"></p>
        <div class="favorite-footer">
          <span class="favorite-date"></span>
        </div>
      `;

      card.querySelector('.category-badge').textContent = fav.category || 'Idea';
      card.querySelector('.favorite-content').textContent = fav.idea || '';
      card.querySelector('.favorite-date').textContent = formatDate(fav.created_at);

      favoritesGrid.appendChild(card);
    });
  }

  async function loadFavorites() {
    try {
      const favorites = await fetchFavoritesFromSupabase();
      renderFavorites(favorites);
    } catch (err) {
      // Fail quietly on load — favorites section just stays empty.
      renderFavorites([]);
    }
  }

  /* ---------------------------------------------------------
     Generate button flow
  --------------------------------------------------------- */
  async function handleGenerateClick() {
    clearError();

    const category = categorySelect.value;
    const prompt = userInput.value.trim();

    if (!prompt) {
      showError('Tell us what you need ideas about before generating.');
      userInput.focus();
      return;
    }

    resultsSection.hidden = false;
    ideasGrid.innerHTML = '';
    loadingIndicator.hidden = false;
    generateBtn.disabled = true;
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    startLoadingMessages(category);

    try {
      const ideas = await generateIdeasFromAI(category, prompt);
      renderIdeaCards(ideas, category);
    } catch (err) {
      showError(err.message || 'Something went wrong generating ideas. Please try again.');
      resultsSection.hidden = true;
    } finally {
      stopLoadingMessages();
      loadingIndicator.hidden = true;
      generateBtn.disabled = false;
    }
  }

  generateBtn.addEventListener('click', handleGenerateClick);
  userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleGenerateClick();
  });

  /* ---------------------------------------------------------
     Init
  --------------------------------------------------------- */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadFavorites);
  } else {
    loadFavorites();
  }
})();