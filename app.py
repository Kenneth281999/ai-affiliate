"""
Flask backend to proxy Replicate and ElevenLabs requests.

- Put your API keys in a .env file (see .env.template). NEVER put keys in frontend code.
- REPLICATE_API_TOKEN: Your Replicate API token
- REPLICATE_MODEL_VERSION: The model version string to use (optional; can be passed from the frontend)
- ELEVENLABS_API_KEY: Your ElevenLabs API key

This is a minimal example—adapt model version and input payload for the specific Replicate model you choose.
"""
import os
import base64
import json
from flask import Flask, request, jsonify, send_from_directory, abort, Response
from dotenv import load_dotenv
import requests

load_dotenv()
REPLICATE_API_TOKEN = os.getenv('REPLICATE_API_TOKEN')
REPLICATE_MODEL_VERSION = os.getenv('REPLICATE_MODEL_VERSION')  # set recommended model version here
ELEVENLABS_API_KEY = os.getenv('ELEVENLABS_API_KEY')

if not REPLICATE_API_TOKEN:
    print('Warning: REPLICATE_API_TOKEN not set. Add it to .env before using Replicate endpoints.')
if not ELEVENLABS_API_KEY:
    print('Warning: ELEVENLABS_API_KEY not set. Add it to .env before using ElevenLabs endpoints.')

app = Flask(__name__, static_url_path='', static_folder='static')

# Serve the index and static files
@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def static_proxy(path):
    # serve static files (css/js)
    if os.path.exists(path):
        return send_from_directory('.', path)
    abort(404)

# Start a Replicate prediction. Accepts multipart/form-data (for uploads) or JSON.
@app.route('/api/replicate/predict', methods=['POST'])
def replicate_predict():
    if not REPLICATE_API_TOKEN:
        return jsonify({'error':'Replicate API token not configured on server.'}), 500

    # Prepare input for the chosen model. The exact shape depends on the model version you pick.
    model_version = request.form.get('model_version') or request.json.get('model_version') if request.is_json else None
    if not model_version:
        model_version = REPLICATE_MODEL_VERSION or '<REPLACE_WITH_YOUR_MODEL_VERSION>'

    payload_input = {}
    # Handle image upload
    if request.form.get('type') == 'image2video' and 'file' in request.files:
        f = request.files['file']
        data = f.read()
        mime = f.mimetype or 'image/png'
        b64 = base64.b64encode(data).decode('utf-8')
        payload_input['image'] = f"data:{mime};base64,{b64}"
        payload_input['prompt'] = request.form.get('prompt')
    else:
        # assume JSON body with type and prompt
        body = request.get_json(force=True, silent=True) or {}
        payload_input['prompt'] = body.get('prompt') or request.form.get('prompt')
        payload_input['type'] = body.get('type') or request.form.get('type')

    # NOTE: Replace the "version" value with the specific Replicate model/version you want to use.
    # You can set REPLICATE_MODEL_VERSION in the .env file. The example below uses the generic predictions API.
    headers = {
        'Authorization': f'Token {REPLICATE_API_TOKEN}',
        'Content-Type': 'application/json'
    }
    body = {
        'version': model_version,
        'input': payload_input
    }
    # Create prediction
    resp = requests.post('https://api.replicate.com/v1/predictions', headers=headers, data=json.dumps(body))
    if resp.status_code >= 400:
        return jsonify({'error':'replicate_error','details':resp.text}), resp.status_code
    return jsonify(resp.json())

# Proxy to check prediction status
@app.route('/api/replicate/status/<prediction_id>', methods=['GET'])
def replicate_status(prediction_id):
    if not REPLICATE_API_TOKEN:
        return jsonify({'error':'Replicate API token not configured on server.'}), 500
    headers = {'Authorization': f'Token {REPLICATE_API_TOKEN}'}
    resp = requests.get(f'https://api.replicate.com/v1/predictions/{prediction_id}', headers=headers)
    if resp.status_code >= 400:
        return jsonify({'error':'replicate_error','details':resp.text}), resp.status_code
    data = resp.json()
    # Return minimal status and outputs to frontend
    return jsonify({'id':data.get('id'),'status':data.get('status'),'output':data.get('output')})

# ElevenLabs TTS proxy
@app.route('/api/elevenlabs/voice', methods=['POST'])
def eleven_voice():
    if not ELEVENLABS_API_KEY:
        return jsonify({'error':'ElevenLabs API key not configured on server.'}), 500
    data = request.get_json(force=True)
    voice = data.get('voice') or 'voice_1'
    text = data.get('text') or ''
    if not text:
        return jsonify({'error':'empty_text'}), 400

    # ElevenLabs API: adjust endpoint if their API changes. This example uses the v1 text-to-speech endpoint.
    url = f'https://api.elevenlabs.io/v1/text-to-speech/{voice}'
    headers = {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json'
    }
    body = {
        'text': text,
        # Optional voice settings can be added here
    }
    # Stream the audio response back to the client
    resp = requests.post(url, headers=headers, json=body, stream=True)
    if resp.status_code >= 400:
        return jsonify({'error':'eleven_error','details':resp.text}), resp.status_code

    def generate():
        for chunk in resp.iter_content(chunk_size=8192):
            if chunk:
                yield chunk
    return Response(generate(), content_type=resp.headers.get('Content-Type','audio/mpeg'))

if __name__ == '__main__':
    # Port 5000 default. For production, use a proper WSGI server.
    app.run(host='0.0.0.0', port=5000, debug=True)
