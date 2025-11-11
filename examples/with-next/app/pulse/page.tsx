'use client';

import { useState } from 'react';

interface DeterminismResult {
  ok: boolean;
  flow: string;
  runs: number;
  sample: string;
  mismatchCount: number;
  hash: string;
}

interface FlowState {
  result: DeterminismResult | null;
  loading: boolean;
  previousHash: string | null;
  hashChanged: boolean;
}

type FlowName = 'buffered' | 'unbuffered' | 'select';

export default function PulsePage() {
  const [flows, setFlows] = useState<Record<FlowName, FlowState>>({
    buffered: { result: null, loading: false, previousHash: null, hashChanged: false },
    unbuffered: { result: null, loading: false, previousHash: null, hashChanged: false },
    select: { result: null, loading: false, previousHash: null, hashChanged: false }
  });

  const runTest = async (flowName: FlowName) => {
    setFlows(prev => ({
      ...prev,
      [flowName]: { ...prev[flowName], loading: true, hashChanged: false }
    }));

    try {
      const res = await fetch(`/api/pulse/${flowName}?runs=10`);
      const data = await res.json();

      setFlows(prev => {
        const prevHash = prev[flowName].previousHash;
        const hashChanged = prevHash !== null && prevHash !== data.hash;
        return {
          ...prev,
          [flowName]: {
            result: data,
            loading: false,
            previousHash: data.hash,
            hashChanged
          }
        };
      });
    } catch (error) {
      console.error('Error:', error);
      setFlows(prev => ({
        ...prev,
        [flowName]: { ...prev[flowName], loading: false }
      }));
    }
  };

  const renderFlowButton = (flowName: FlowName, label: string) => {
    const flow = flows[flowName];
    return (
      <div key={flowName} style={{ marginBottom: '2rem', padding: '1rem', border: '1px solid #ddd' }}>
        <h2>{label}</h2>
        <button
          onClick={() => runTest(flowName)}
          disabled={flow.loading}
          id={`test-${flowName}`}
          style={{
            padding: '0.5rem 1rem',
            fontSize: '1rem',
            cursor: flow.loading ? 'not-allowed' : 'pointer',
            background: flow.loading ? '#ccc' : '#007bff',
            color: '#fff',
            border: 'none',
            borderRadius: '4px'
          }}
        >
          {flow.loading ? 'Running...' : `Run ${flowName} test (10×)`}
        </button>

        {flow.result && (
          <div style={{ marginTop: '1rem' }} id={`result-${flowName}`}>
            <h3>Results:</h3>
            <pre style={{ background: '#f5f5f5', padding: '1rem', borderRadius: '4px' }}>
              Flow: {flow.result.flow}
              {'\n'}Runs: {flow.result.runs}
              {'\n'}Sample: {flow.result.sample}
              {'\n'}Mismatches: {flow.result.mismatchCount}
              {'\n'}Hash: {flow.result.hash}
            </pre>

            {flow.hashChanged && (
              <div style={{ color: 'red', marginTop: '0.5rem', fontWeight: 'bold' }}>
                ⚠️ WARNING: Hash changed between runs!
              </div>
            )}

            {!flow.hashChanged && flow.previousHash && (
              <div style={{ color: 'green', marginTop: '0.5rem', fontWeight: 'bold' }}>
                ✅ Hash is stable across runs
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <main style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Pulse 1.0.0 Determinism Demo</h1>
      <p>Test 3 non-trivial flows with deterministic execution</p>

      <div style={{ marginTop: '2rem' }}>
        {renderFlowButton('buffered', 'Buffered Channel (5-capacity)')}
        {renderFlowButton('unbuffered', 'Unbuffered Channel (rendezvous)')}
        {renderFlowButton('select', 'Select (3-channel multiplexing)')}
      </div>

      <div style={{ marginTop: '2rem', padding: '1rem', background: '#f0f0f0', borderRadius: '4px' }}>
        <h3>About this demo:</h3>
        <ul style={{ marginLeft: '1.5rem' }}>
          <li>Each flow runs with DeterministicScheduler</li>
          <li>Uses spawn, sleep, channels, and select primitives</li>
          <li>100% deterministic - same input → same output → same hash</li>
          <li>No setTimeout, setImmediate, or Promise.race in runtime</li>
        </ul>
      </div>
    </main>
  );
}
