import { NextResponse } from 'next/server';

// Temporary diagnostic route — reports which env vars are present without
// leaking values. Remove once the Azure Static Web Apps env delivery issue
// is resolved.
export async function GET() {
  const keys = [
    'NEXTAUTH_URL',
    'NEXTAUTH_SECRET',
    'AZURE_AD_CLIENT_ID',
    'AZURE_AD_CLIENT_SECRET',
    'AZURE_AD_TENANT_ID',
    'AZURE_COSMOS_ENDPOINT',
    'AZURE_COSMOS_KEY',
  ];
  const present = Object.fromEntries(
    keys.map((k) => [k, Boolean(process.env[k])]),
  );
  return NextResponse.json({ present, nodeEnv: process.env.NODE_ENV });
}
