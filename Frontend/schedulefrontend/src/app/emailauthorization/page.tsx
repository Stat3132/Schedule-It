"'use client';"
import { useState, useEffect } from 'react';
import { Mail, CheckCircle, ArrowLeft } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface SmsVerificationProps {
  verificationId: string;
  onVerified: () => void;
  onBack: () => void;
}

export default function SmsVerification({
  verificationId,
  onVerified,
  onBack
}: SmsVerificationProps) {
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isVerified, setIsVerified] = useState(false);


  const handleCodeChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;

    const newCode = [...code];
    newCode[index] = value.slice(-1);
    setCode(newCode);
    setError('');

    if (value && index < 5) {
      const nextInput = document.getElementById(`code-${index + 1}`);
      nextInput?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      const prevInput = document.getElementById(`code-${index - 1}`);
      prevInput?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '');
    const newCode = [...code];

    for (let i = 0; i < Math.min(pastedData.length, 6); i++) {
      newCode[i] = pastedData[i];
    }

    setCode(newCode);
  };

  const verifyCode = async () => {
    const enteredCode = code.join('');
    if (enteredCode.length !== 6) {
      setError('Please enter all 6 digits');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const { data, error: fetchError } = await supabase
        .from('phone_verifications')
        .select('verification_code, expires_at, is_verified')
        .eq('id', verificationId)
        .single();

      if (fetchError) throw fetchError;

      if (data.is_verified) {
        setError('This verification code has already been used');
        setIsLoading(false);
        return;
      }

      if (new Date(data.expires_at) < new Date()) {
        setError('Verification code has expired');
        setIsLoading(false);
        return;
      }

      if (data.verification_code !== enteredCode) {
        setError('Invalid verification code. Please try again.');
        setCode(['', '', '', '', '', '']);
        setIsLoading(false);
        return;
      }

      const { error: updateError } = await supabase
        .from('phone_verifications')
        .update({
          is_verified: true,
          verified_at: new Date().toISOString()
        })
        .eq('id', verificationId);

      if (updateError) throw updateError;

      setIsVerified(true);
      setTimeout(() => {
        onVerified();
      }, 2000);
    } catch (err) {
      setError('Failed to verify code. Please try again.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (code.every(digit => digit !== '')) {
      verifyCode();
    }
  }, [code]);

  if (isVerified) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md text-center">
          <div className="flex justify-center mb-6">
            <div className="bg-green-100 p-4 rounded-full">
              <CheckCircle className="w-12 h-12 text-green-600" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-slate-800 mb-2">
            Verified!
          </h1>
          <p className="text-slate-600">
            Your Gmail has been successfully verified
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
        <button
          onClick={onBack}
          className="flex items-center text-slate-600 hover:text-slate-800 mb-6 transition"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </button>

        <div className="flex justify-center mb-6">
          <div className="bg-blue-100 p-4 rounded-full">
            <Mail className="w-8 h-8 text-blue-600" />
          </div>
        </div>

        <h1 className="text-3xl font-bold text-center text-slate-800 mb-2">
          Verify Gmail OTP
        </h1>
        <p className="text-center text-slate-600 mb-8">
          Enter the 6-digit code sent to your Gmail
        </p>

        <div className="mb-6">
          <div className="flex justify-center gap-2 mb-4">
            {code.map((digit, index) => (
              <input
                key={index}
                id={`code-${index}`}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleCodeChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                onPaste={handlePaste}
                className="w-12 h-14 text-center text-2xl font-bold rounded-lg border-2 border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                disabled={isLoading}
              />
            ))}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm text-center">
              {error}
            </div>
          )}
        </div>

        <button
          onClick={verifyCode}
          disabled={isLoading || code.some(digit => digit === '')}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Verifying...' : 'Verify Code'}
        </button>

        <p className="text-center text-sm text-slate-500 mt-6">
          Didn't receive a code?{' '}
          <button className="text-blue-600 hover:text-blue-700 font-medium">
            Resend
          </button>
        </p>

      </div>
    </div>
  );
}
