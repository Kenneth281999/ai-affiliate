// Frontend interactions: search, categories, tabs, forms, and video/voice generation using backend endpoints

document.addEventListener('DOMContentLoaded', ()=>{
  // Mobile nav
  const mobileToggle = document.getElementById('mobileToggle');
  const navLinks = document.getElementById('navLinks');
  mobileToggle.addEventListener('click', ()=>{
    if(navLinks.style.display === 'flex') navLinks.style.display = 'none'; else navLinks.style.display = 'flex';
  });

  // Year
  document.getElementById('year').textContent = new Date().getFullYear();

  // Search + filter
  const search = document.getElementById('search');
  const chips = Array.from(document.querySelectorAll('.chip'));
  const cards = Array.from(document.querySelectorAll('#toolsGrid .card'));

  function filterCards(){
    const q = search.value.toLowerCase().trim();
    const activeChip = chips.find(c=>c.classList.contains('active'));
    const cat = activeChip ? activeChip.dataset.cat : 'all';

    cards.forEach(card=>{
      const text = (card.innerText || '').toLowerCase();
      const matchesQ = q === '' || text.includes(q);
      const matchesCat = cat === 'all' || (card.dataset.cat === cat);
      card.style.display = (matchesQ && matchesCat) ? 'block' : 'none';
    });
  }

  search.addEventListener('input', filterCards);
  chips.forEach(chip=>{
    chip.addEventListener('click', ()=>{
      chips.forEach(c=>c.classList.remove('active'));
      chip.classList.add('active');
      filterCards();
    });
  });
  // default active
  document.querySelector('.chip[data-cat="all"]').classList.add('active');

  // Tabs
  const tabs = Array.from(document.querySelectorAll('.tab'));
  const panels = Array.from(document.querySelectorAll('.panel'));
  tabs.forEach(t=>t.addEventListener('click', ()=>{
    tabs.forEach(x=>x.classList.remove('active'));
    panels.forEach(p=>p.classList.remove('active'));
    t.classList.add('active');
    document.getElementById(t.dataset.tab).classList.add('active');
  }));

  // Forms
  const imageForm = document.getElementById('imageForm');
  const textForm = document.getElementById('textForm');
  const voiceForm = document.getElementById('voiceForm');
  const preview = document.getElementById('mediaPreview');

  imageForm.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const file = document.getElementById('imageFile').files[0];
    const prompt = document.getElementById('imagePrompt').value.trim();
    if(!file || !prompt) return alert('Please provide an image and prompt');

    const progress = document.getElementById('imageProgress');
    progress.hidden = false; progress.querySelector('.bar').style.width = '5%';
    progress.querySelector('.status').textContent = 'Uploading...';

    const fd = new FormData(); fd.append('type','image2video'); fd.append('prompt',prompt); fd.append('file',file);

    const startRes = await fetch('/api/replicate/predict', {method:'POST', body:fd});
    if(!startRes.ok) return alert('Failed to start generation');
    const startData = await startRes.json();
    const id = startData.id;
    pollPrediction(id, progress, preview, 'video');
  });

  textForm.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const prompt = document.getElementById('textPrompt').value.trim();
    if(!prompt) return alert('Please provide a prompt');
    const progress = document.getElementById('textProgress');
    progress.hidden = false; progress.querySelector('.bar').style.width = '5%';
    progress.querySelector('.status').textContent = 'Starting...';
    const res = await fetch('/api/replicate/predict', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({type:'text2video', prompt})});
    if(!res.ok) return alert('Failed to start generation');
    const data = await res.json();
    pollPrediction(data.id, progress, preview, 'video');
  });

  voiceForm.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const voice = document.getElementById('voiceSelect').value;
    const script = document.getElementById('voiceScript').value.trim();
    if(!script) return alert('Please provide script text');
    const progress = document.getElementById('voiceProgress');
    progress.hidden = false; progress.querySelector('.bar').style.width = '10%';
    progress.querySelector('.status').textContent = 'Generating audio...';

    const res = await fetch('/api/elevenlabs/voice', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({voice, text:script})});
    if(!res.ok) return alert('Voice generation failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    preview.innerHTML = '';
    const audio = document.createElement('audio'); audio.controls = true; audio.src = url;
    preview.appendChild(audio);
    progress.querySelector('.bar').style.width = '100%'; progress.querySelector('.status').textContent = 'Done';
    progress.hidden = true;
  });

  // Poll helper
  async function pollPrediction(id, progressEl, previewEl, kind){
    let pct = 10;
    progressEl.querySelector('.bar').style.width = pct + '%';
    progressEl.querySelector('.status').textContent = 'Processing...';
    const statusUrl = '/api/replicate/status/' + encodeURIComponent(id);
    const start = Date.now();
    while(true){
      const res = await fetch(statusUrl);
      if(!res.ok) { progressEl.querySelector('.status').textContent = 'Error'; break; }
      const data = await res.json();
      // Update progress bar with best-effort
      if(data.status === 'starting') pct = Math.min(30,pct+10);
      if(data.status === 'processing') pct = Math.min(70,pct+15);
      if(data.status === 'succeeded') pct = 100;
      progressEl.querySelector('.bar').style.width = pct + '%';
      progressEl.querySelector('.status').textContent = data.status + (data.output ? ' — ready' : '');

      if(data.output && data.output.length){
        // assume first output is a URL to video
        const out = data.output[0];
        previewEl.innerHTML = '';
        if(kind === 'video'){
          const video = document.createElement('video'); video.controls = true; video.src = out; video.style.maxWidth = '100%';
          previewEl.appendChild(video);
        } else {
          const a = document.createElement('a'); a.href = out; a.textContent = 'Download result'; a.target = '_blank';
          previewEl.appendChild(a);
        }
        progressEl.querySelector('.bar').style.width = '100%'; progressEl.querySelector('.status').textContent = 'Completed';
        setTimeout(()=>progressEl.hidden = true,1200);
        break;
      }

      if(data.status === 'failed'){
        progressEl.querySelector('.status').textContent = 'Failed';
        break;
      }

      // timeout after 5 minutes
      if((Date.now()-start) > 1000*60*5){
        progressEl.querySelector('.status').textContent = 'Timeout';
        break;
      }

      await new Promise(r=>setTimeout(r,3000));
    }
  }

  // Newsletter form simple placeholder
  document.getElementById('newsletterForm').addEventListener('submit', e=>{e.preventDefault();alert('Thanks! Add newsletter backend integration.')});

});
