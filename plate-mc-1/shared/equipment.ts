/** Equipment is purchased once for the entire team and applied on the next order. */
export type Product = { name:string; price:number; limit:number; effect:"vehicle"|"cover"; width?:number };
export const products:Record<string,Product> = {
  van: { name:"加宽货车",price:40,limit:1,effect:"vehicle",width:322 },
  tarp: { name:"防雨布",price:15,limit:1,effect:"cover" },
};
