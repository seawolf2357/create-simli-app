'use client';
import React, { useState } from 'react';
import AvatarInteraction from './AvatarInteraction';
import DottedFace from './DottedFace';
import SimliHeaderLogo from './Logo';
import Navbar from './Navbar';

// Avatar 인터페이스 정의
interface Avatar {
  name: string;
  simli_faceid: string;
  elevenlabs_voiceid: string;
  initialPrompt: string;
  imageUrl?: string;  // optional
}

// 아바타 데이터
const avatar: Avatar = {
  name: "Chrystal",
  simli_faceid: "74bf81fc-853f-41f6-aaa8-a8772d784327",
  elevenlabs_voiceid: "1W00IGEmNmwmsDeYy7ag",
  initialPrompt: "Say this introduction: Welcome to your local Create-Simli-App, the interactive demo for Simli that you can start building from. You can swap me out with other characters.",
};

const Demo: React.FC = () => {
  const [error, setError] = useState('');
  const [showDottedFace, setShowDottedFace] = useState(true);

  const onStart = () => {
    console.log("Setting setshowDottedface to false...");
    setShowDottedFace(false);
  };

  return (
    <div className="bg-black min-h-screen flex flex-col items-center font-abc-repro font-normal text-sm text-white p-8">
      <SimliHeaderLogo />
      <Navbar />
      <div className="absolute top-[32px] right-[32px]">
        <text className="font-bold mb-8 text-xl leading-8">Create Simli App</text>
      </div>
      <div className="flex flex-col items-center gap-6 bg-effect15White p-6 pb-[40px] rounded-xl w-full">
        <div>
          {showDottedFace && <DottedFace />}
          <AvatarInteraction
            simli_faceid={avatar.simli_faceid}
            elevenlabs_voiceid={avatar.elevenlabs_voiceid}
            initialPrompt={avatar.initialPrompt}
            onStart={onStart}
            showDottedFace={showDottedFace}
          />
        </div>
      </div>

      <div className="max-w-[350px] font-thin flex flex-col items-center ">
        <span className="font-bold mb-[8px] leading-5 "> Create Simli App is a starter repo for creating an interactive app with Simli. </span>
        <ul className="list-decimal list-inside max-w-[350px] ml-[6px] mt-2">
          <li className="mb-1">
            Fill in your API keys in the .env file.
          </li>
          <li className="mb-1">
            Test out the interaction and have a conversation with our default avatar.
          </li>
          <li className="mb-1">
            You can replace the avatar's face and voice and initial prompt with your own. Do this by editing <code>app/page.tsx</code>.
          </li>
        </ul>
        <span className=" mt-[16px]">You can now deploy this app to Vercel, or incorporate it as part of your existing project.</span>
      </div>
      {error && <p className="mt-6 text-red-500 bg-red-100 border border-red-400 rounded p-3">{error}</p>}
    </div>
  );
};

export default Demo;
