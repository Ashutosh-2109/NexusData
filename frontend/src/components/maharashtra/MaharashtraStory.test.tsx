import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import MaharashtraStory from './MaharashtraStory';
import type { MaharashtraDistrict, MaharashtraMeta } from './types';

const districts: MaharashtraDistrict[] = [{id:'pune',name:'Pune',metrics:{population_2011:9429408,density_2011:603},statistics:{},coverage_warning:null,census_series:[]}];
const meta: MaharashtraMeta={district_count:36,temporal_scope:'reference years vary / unspecified',source_note:'Workbook',counts:{},data_dictionary:{},quality_summary:[],quality_rules:[]};
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
describe('Maharashtra story mode',()=>{
  it('opens a nine-slide data-led deck and navigates with arrow keys',()=>{
    vi.stubGlobal('fetch',vi.fn(()=>Promise.resolve({json:async()=>({items:[],top_pairs:[]})})));
    render(<MaharashtraStory districts={districts} meta={meta}/>);
    fireEvent.click(screen.getByRole('button',{name:/Present the story/}));
    expect(screen.getByText('1 / 9')).toBeTruthy();
    expect(screen.getByText(/Maharashtra in 36 district profiles/)).toBeTruthy();
    fireEvent.keyDown(window,{key:'ArrowRight'});
    expect(screen.getByText('2 / 9')).toBeTruthy();
    fireEvent.keyDown(window,{key:'Escape'});
    expect(screen.queryByRole('region',{name:'Maharashtra data presentation'})).toBeNull();
  });
});
