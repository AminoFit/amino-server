const {test}=require('node:test');
const assert=require('node:assert/strict');
require('ts-node/register');
require('tsconfig-paths/register');
const {carriesEveryWord}=require('../src/mealResolution/evidence.ts');

test('a habit food matches a mention only when it carries every word of it',()=>{
  // The usual variant is found from a short mention.
  assert.equal(carriesEveryWord('blueberry kefir','Lowfat Blueberry Kefir','Lifeway Foods'),true);
  assert.equal(carriesEveryWord('kefir','Lowfat Plain Kefir','Lifeway Foods'),true);
  assert.equal(carriesEveryWord('ghee','Original Recipe Ghee Clarified Butter, Original Recipe','4th & Heart'),true);
  // Words that name another variant overrule the habit: "fat" must start a word, and "lowfat" doesn't.
  assert.equal(carriesEveryWord('full fat kefir','Lowfat Plain Kefir','Lifeway Foods'),false);
  assert.equal(carriesEveryWord('whole milk kefir','Lowfat Plain Kefir','Lifeway Foods'),false);
  // A near miss that a similarity threshold let through.
  assert.equal(carriesEveryWord('fat free milk','Fat Free Shredded Mozzarella Cheese','Kraft'),false);
  // Brand and name together, numbers, accents and other scripts.
  assert.equal(carriesEveryWord('fairlife 2% milk','2% Reduced Fat Ultra-Filtered Milk','fairlife'),true);
  assert.equal(carriesEveryWord('cafe con leche','Café con leche',null),true);
  assert.equal(carriesEveryWord('ゆで卵','ゆで卵',null),true);
  // A word inside a longer one isn't the food: "apple" is not the Applegate brand.
  assert.equal(carriesEveryWord('apple','Oven Roasted Turkey Breast, Oven Roasted','Applegate'),false);
  assert.equal(carriesEveryWord('egg','eggs',null),true);
  // Short words alone don't match anything.
  assert.equal(carriesEveryWord('de','Pechuga de pollo',null),false);
});
