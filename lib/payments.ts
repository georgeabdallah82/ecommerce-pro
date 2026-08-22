export type PaymentProvider = { name:string; createPayment:(input:{orderId:string;amount:number;currency:string})=>Promise<{status:string;externalId?:string}> }
export const manualPaymentProvider:PaymentProvider={name:'manual',async createPayment(){return {status:'created'}}}
export function getPaymentProvider():PaymentProvider{const name=(process.env.PAYMENT_PROVIDER||'manual').toLowerCase();if(name==='manual')return manualPaymentProvider;throw new Error(`Payment provider ${name} is not configured`)}
