import React, { useCallback, useEffect, useRef, useState } from 'react';
import { SimliClient } from 'simli-client';
import VideoBox from './VideoBox';

interface AvatarInteractionProps {
  simli_faceid: string;
  elevenlabs_voiceid: string;
  initialPrompt: string;
  onStart: () => void;
  showDottedFace: boolean;
}

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://your-backend-url.com';

const AvatarInteraction: React.FC<AvatarInteractionProps> = ({
  simli_faceid,
  elevenlabs_voiceid,
  initialPrompt,
  onStart,
  showDottedFace
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isAvatarVisible, setIsAvatarVisible] = useState(false);
  const [error, setError] = useState('');
  const [startWebRTC, setStartWebRTC] = useState(false);
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const simliClientRef = useRef<SimliClient | null>(null);
  const textAreaRef = useRef<HTMLDivElement>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);

const startRecording = async () => {
  console.log('Starting recording...');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      } 
    });
    setAudioStream(stream);
    setIsRecording(true);
    
    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    const processor = audioContext.createScriptProcessor(4096, 1, 1);

    source.connect(processor);
    processor.connect(audioContext.destination);

    let lastAudioTimestamp = 0;
    const SEND_INTERVAL = 100; // 100ms

    processor.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0);
      const currentTime = Date.now();
      
      if (currentTime - lastAudioTimestamp >= SEND_INTERVAL) {
        const outputData = new Float32Array(inputData.length);
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) {
          // Apply a simple noise gate and low-pass filter
          outputData[i] = Math.abs(inputData[i]) > 0.01 ? inputData[i] : 0;
          sum += outputData[i] * outputData[i];
        }
        
        const rms = Math.sqrt(sum / inputData.length);
        if (rms > 0.01) {  // Only send if there's significant audio
          const uint8Array = new Uint8Array(outputData.buffer);
          console.log('Sending audio data, length:', uint8Array.length, 'RMS:', rms);
          simliClientRef.current?.sendAudioData(uint8Array);
        }
        
        lastAudioTimestamp = currentTime;
      }
    };
  } catch (err) {
    console.error('Error accessing microphone:', err);
    setError('Error accessing microphone. Please check your permissions.');
  }
};

  
  const initializeSimliClient = useCallback(() => {
    console.log('Initializing SimliClient...');
    if (videoRef.current && audioRef.current) {
      const apiKey = process.env.NEXT_PUBLIC_SIMLI_API_KEY;
      if (!apiKey) {
        console.error('Simli API key is not set');
        setError('Simli API key is missing. Please check your environment variables.');
        return;
      }

      const SimliConfig = {
        apiKey: apiKey,
        faceID: simli_faceid,
        handleSilence: true,
        videoRef: videoRef,
        audioRef: audioRef,
      };

      simliClientRef.current = new SimliClient();
      simliClientRef.current.Initialize(SimliConfig);
      console.log('Simli Client initialized');
    }
  }, [simli_faceid]);

const startConversation = useCallback(async () => {
  console.log('Starting conversation...');
  try {
    console.log(`Sending request to ${BACKEND_URL}/start-conversation`);
    const response = await fetch(`${BACKEND_URL}/start-conversation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: initialPrompt,
        voiceId: elevenlabs_voiceid
      }),
    });

    console.log('Response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error response:', errorText);
      throw new Error(errorText || 'Failed to start conversation');
    }

    const data = await response.json();
    console.log('Conversation started:', data);
    setConnectionId(data.connectionId);

    initializeWebSocket(data.connectionId);
  } catch (error: unknown) {
    console.error('Error starting conversation:', error);
    if (error instanceof Error) {
      setError(`Failed to start conversation: ${error.message}`);
    } else {
      setError('Failed to start conversation: Unknown error');
    }
  }
}, [initialPrompt, elevenlabs_voiceid]);

  
  const initializeWebSocket = useCallback((connectionId: string) => {
    console.log('Initializing WebSocket...');
    socketRef.current = new WebSocket(`${BACKEND_URL.replace('http', 'ws')}/ws?connectionId=${connectionId}`);

    socketRef.current.onopen = () => {
      console.log('WebSocket connected');
    };

    socketRef.current.onmessage = (event) => {
      console.log('Received message from server:', event.data);
      if (event.data instanceof Blob) {
        event.data.arrayBuffer().then((arrayBuffer) => {
          const uint8Array = new Uint8Array(arrayBuffer);
          console.log('Received audio data, length:', uint8Array.length);
          
          // Convert Uint8Array to Float32Array
          const float32Array = new Float32Array(uint8Array.buffer);
          
          // Apply a simple low-pass filter
          const filteredData = new Float32Array(float32Array.length);
          let lastSample = 0;
          for (let i = 0; i < float32Array.length; i++) {
            filteredData[i] = 0.5 * float32Array[i] + 0.5 * lastSample;
            lastSample = filteredData[i];
          }
          
          // Convert back to Uint8Array
          const filteredUint8Array = new Uint8Array(filteredData.buffer);
          
          simliClientRef.current?.sendAudioData(filteredUint8Array);
        });
      } else {
        const message = JSON.parse(event.data);
        console.log('Parsed message:', message);
      }
    };

    socketRef.current.onerror = (error) => {
      console.error('WebSocket error:', error);
      setError('WebSocket connection error. Please check if the server is running.');
    };

    socketRef.current.onclose = () => {
      console.log('WebSocket disconnected');
    };
  }, []);

  const isWebRTCConnected = useCallback(() => {
    if (!simliClientRef.current) return false;

    const pc = (simliClientRef.current as any).pc as RTCPeerConnection | null;
    const dc = (simliClientRef.current as any).dc as RTCDataChannel | null;

    return pc !== null &&
      pc.iceConnectionState === 'connected' &&
      dc !== null &&
      dc.readyState === 'open';
  }, []);

  const handleCancel = useCallback(async () => {
    console.log('Cancelling interaction...');
    setIsLoading(false);
    setError('');
    setStartWebRTC(false);
    setIsRecording(false);
    setAudioStream(null);
    simliClientRef.current?.close();
    socketRef.current?.close();
    window.location.href = 'https://create-simli-app-nine.vercel.app/';
  }, []);

  const handleStart = useCallback(async () => {
    console.log('Starting interaction...');
    startRecording();
    onStart();
    setIsLoading(true);
    setError('');

    console.log('Starting ElevenLabs conversation');
    await startConversation();
    console.log('Starting WebRTC');
    simliClientRef.current?.start();
    setStartWebRTC(true);

    const checkConnection = async () => {
      if (isWebRTCConnected()) {
        setIsAvatarVisible(true);
        console.log('WebRTC connection established');
        const audioData = new Uint8Array(6000).fill(0);
        simliClientRef.current?.sendAudioData(audioData);
        console.log('Sent initial audio data');
      } else {
        console.log('Waiting for WebRTC connection...');
        setTimeout(checkConnection, 1000);
      }
    };

    setTimeout(checkConnection, 4000);
  }, [startConversation, onStart, isWebRTCConnected]);

  useEffect(() => {
    initializeSimliClient();

    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
      if (simliClientRef.current) {
        simliClientRef.current.close();
      }
    };
  }, [initializeSimliClient]);

  useEffect(() => {
    if (audioStream && socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      const mediaRecorder = new MediaRecorder(audioStream);

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          console.log('Sending audio data to WebSocket');
          socketRef.current?.send(event.data);
        }
      };

      mediaRecorder.start(100);

      return () => {
        mediaRecorder.stop();
      };
    }
  }, [audioStream]);

  return (
    <>
      <div className={`transition-all duration-300 ${showDottedFace ? 'h-0 overflow-hidden' : 'h-auto'}`}>
        <VideoBox video={videoRef} audio={audioRef} />
      </div>
      <div className="flex justify-center">
        {!isLoading ? (
          <button
            onClick={handleStart}
            disabled={isLoading}
            className="w-full mt-4 bg-simliblue text-white py-3 px-6 rounded-[100px] transition-all duration-300 hover:text-black hover:bg-white hover:rounded-sm"
          >
            <span className="font-abc-repro-mono font-bold w-[164px]">
              Test Interaction
            </span>
          </button>
        ) : isAvatarVisible ? (
          <button
            onClick={handleCancel}
            className="w-full mt-4 bg-red-600 text-white py-3 justify-center rounded-[100px] backdrop-blur transition-all duration-300 hover:rounded hover:bg-white hover:text-black hover:rounded-sm px-6"
          >
            <span className="font-abc-repro-mono font-bold w-[164px]">
              Stop
            </span>
          </button>
        ) : (
          <button
            onClick={handleCancel}
            className="w-full mt-4 bg-zinc-700 text-white py-3 justify-center rounded-[100px] backdrop-blur transition-all duration-300 hover:rounded hover:bg-white hover:text-black hover:rounded-sm px-6"
          >
            <span className="font-abc-repro-mono font-bold w-[164px]">
              Loading...
            </span>
          </button>
        )}
      </div>
      {error && (
        <div className="mt-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
          <p>{error}</p>
          <button 
            onClick={() => setError('')} 
            className="mt-2 text-sm text-red-600 hover:text-red-800"
          >
            Dismiss
          </button>
        </div>
      )}
    </>
  );
};

export default AvatarInteraction;
