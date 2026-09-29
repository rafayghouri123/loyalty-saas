import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { batchInput, renderTemplate, taskAction, templateBody, whatsappLink } from '../../src/features/whatsapp/contracts';
describe('Manual WhatsApp contracts', () => {
  it('counts trimmed Unicode code points and rejects every unsupported template expression', () => {
    expect(templateBody.parse('  '+ '😀'.repeat(10) +'  ')).toBe('😀'.repeat(10));
    expect(templateBody.safeParse('😀'.repeat(1000)).success).toBe(true);
    for (const value of ['😀'.repeat(9), '😀'.repeat(1001), 'Hello {{unknown}} today', 'Hello {{ first_name }} today', 'Hello {{{first_name}}} today', 'Hello {{first_name today', 'Hello } today', 'Hello <% run() %> today', 'Hello ${name} today']) expect(templateBody.safeParse(value).success, value).toBe(false);
  });
  it('substitutes literal values once and refuses missing data or expanded text outside limits', () => {
    expect(renderTemplate('Hello {{first_name}} at {{business_name}}.', { first_name: '{{reward_name}}', business_name: 'Cafe & 😀' }).body).toBe('Hello {{reward_name}} at Cafe & 😀.');
    expect(renderTemplate('Come for {{reward_name}} today.', {}).error).toBe('Missing reward_name.');
    expect(renderTemplate('x'.repeat(980)+' {{business_name}}', { business_name: 'Cafe'.repeat(20) }).body).toBeNull();
  });
  it('normalizes Pakistani and international numbers and safely encodes Unicode, newlines and URL punctuation', () => {
    const body='Hello Ayesha 😀\nEnjoy tea & coffee? 20% off + a treat.';
    const url=new URL(whatsappLink('0300 1234567',body));
    expect(url.origin).toBe('https://wa.me');expect(url.pathname).toBe('/923001234567');expect(url.searchParams.get('text')).toBe(body);
    expect(new URL(whatsappLink('+44 20 7946 0018',body)).pathname).toBe('/442079460018');
    for(const number of ['1234','Call +923001234567','+923001234567 ext 2','https://evil.invalid'])expect(()=>whatsappLink(number,body)).toThrow();
  });
  it('requires sent attestation and rejects client permissions or contact values', () => {
    const input={businessId:randomUUID(),taskId:randomUUID(),rowVersion:1,action:'mark_sent',attestsSent:false};
    expect(taskAction.safeParse(input).success).toBe(false);
    expect(taskAction.safeParse({...input,attestsSent:true}).success).toBe(true);
    expect(taskAction.safeParse({...input,attestsSent:true,phone:'+923001234567'}).success).toBe(false);
    const base={businessId:randomUUID(),name:'Follow-up',templateId:randomUUID(),templateVersion:1,audience:'reward_ready',memberIds:[],inactiveDays:null,targetRewardVersionId:null,offerId:null,assignedBusinessUserId:null};
    expect(batchInput.safeParse(base).success).toBe(false);
    expect(batchInput.safeParse({...base,targetRewardVersionId:randomUUID()}).success).toBe(true);
  });
});
