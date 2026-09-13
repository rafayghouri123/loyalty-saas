import { describe, it, expect } from 'vitest';
import { codePointLength, money, profileCompletionSchema, rupeesToPaisa, text } from '../../src/lib/validation/primitives';
import { formatPaisa } from '../../src/lib/formatting';
import { readSmallJson, safeReturnPath, validMutationOrigin } from '../../src/lib/security/http';

describe('money and Unicode contracts',()=>{
  it('converts paisa exactly and rejects fractions beyond two digits',()=>{
    expect(rupeesToPaisa('250.05')).toBe('25005');
    expect(rupeesToPaisa('0.01')).toBe('1');
    for(const value of ['1.001','-1','1e3','Infinity','1,000','1000000.01']) expect(()=>rupeesToPaisa(value)).toThrow();
    expect(money.safeParse(25000).success).toBe(false);
    expect(formatPaisa(-40050n)).toBe('-Rs 400.50');
  });
  it('counts code points, trims names, and rejects unknown authority fields',()=>{
    expect(codePointLength('☕😀')).toBe(2);
    expect(text(3,80).safeParse('😀'.repeat(80)).success).toBe(true);
    expect(text(3,80).safeParse('😀'.repeat(81)).success).toBe(false);
    expect(profileCompletionSchema.parse({displayName:'  Customer  '})).toEqual({displayName:'Customer'});
    expect(profileCompletionSchema.safeParse({displayName:'Customer',role:'owner'}).success).toBe(false);
    expect(profileCompletionSchema.safeParse({displayName:'   '}).success).toBe(false);
  });
});

describe('HTTP boundaries',()=>{
  it('rejects cross-origin, non-JSON and missing origin writes',()=>{
    const url='https://loyalty.example/api/profile';
    const make=(origin?:string,type='application/json')=>new Request(url,{method:'POST',headers:{...(origin?{origin}:{}),'content-type':type}});
    expect(validMutationOrigin(make('https://loyalty.example'),'https://loyalty.example')).toBe(true);
    expect(validMutationOrigin(make('https://attacker.example'),'https://loyalty.example')).toBe(false);
    expect(validMutationOrigin(make(),'https://loyalty.example')).toBe(false);
    expect(validMutationOrigin(make('https://loyalty.example','text/plain'),'https://loyalty.example')).toBe(false);
  });
  it('never follows protocol-relative/external/backslash/control-character returns',()=>{
    for(const value of ['https://evil.example','//evil.example','/\\evil.example','/app\nX','/api/delete','/admin']) expect(safeReturnPath(value)).toBe('/app');
    expect(safeReturnPath('/join/test-cafe?branch=123')).toBe('/join/test-cafe?branch=123');
    expect(safeReturnPath('/workspace')).toBe('/workspace');
  });
  it('bounds the actual request stream rather than trusting Content-Length',async()=>{
    const make=(body:string)=>new Request('https://loyalty.example/api/profile',{method:'POST',body,headers:{'content-type':'application/json','content-length':'1'}});
    await expect(readSmallJson(make('{"x":1}'),20)).resolves.toEqual({x:1});
    await expect(readSmallJson(make(JSON.stringify({x:'a'.repeat(100)})),20)).rejects.toThrow();
    await expect(readSmallJson(make('invalid'),20)).rejects.toThrow();
  });
});
