-- Manyhands: execute once in Supabase SQL Editor, then enable anonymous auth.
-- No cron: only active visitors request ticks. Elapsed offline time is discarded.
create table if not exists public.mh_worlds (
  name text primary key check (name ~ '^[a-z0-9-]{1,40}$'),
  state jsonb not null,
  last_tick timestamptz not null default clock_timestamp(),
  created_by uuid not null,
  created_at timestamptz not null default now()
);
create table if not exists public.mh_visitors (
  world_name text references public.mh_worlds(name) on delete cascade,
  user_id uuid not null,
  last_edit timestamptz not null default '1970-01-01',
  primary key (world_name,user_id)
);
alter table public.mh_worlds enable row level security;
alter table public.mh_visitors enable row level security;
revoke all on public.mh_worlds, public.mh_visitors from anon, authenticated;

create or replace function public.mh_seed() returns jsonb language plpgsql set search_path = '' as $$
declare tiles jsonb := '[]'; x int; y int; h int; d float; n float; t jsonb;
begin
  for y in 0..27 loop for x in 0..27 loop
    d := sqrt(power((x-13.2)/12,2)+power((y-13.8)/10.5,2));
    h := greatest(0,least(6,floor((1-d)*6+sin(x*.55)*.65+cos(y*.6)*.6)::int));
    n := sin(x*127.1+y*311.7)*43758.5453; n := n-floor(n);
    t := jsonb_build_object('h',h,'tree',h>1 and h<5 and n>.65,'b',null,'p',0);
    if (x=11 and y=15) or (x=16 and y=12) or (x=13 and y=10) then t := jsonb_build_object('h',3,'tree',false,'b','village','p',5,'owner','hands'); end if;
    if (x=21 and y=12) or (x=17 and y=17) or (x=20 and y=18) then t := jsonb_build_object('h',3,'tree',false,'b','village','p',5,'owner','rival'); end if;
    tiles := tiles || jsonb_build_array(t);
  end loop; end loop;
  return jsonb_build_object('tiles',tiles,'mana',80,'age',0,'version',0,'walkers','[]'::jsonb,'rival',jsonb_build_object('phase','watching','lastExpansion',0),'events',jsonb_build_array(jsonb_build_object('text','Three settlements look to the sky.','age',0)));
end; $$;

create or replace function public.mh_enter_world(room_name text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare s jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in to enter an island.'; end if;
  if room_name is null or room_name !~ '^[a-z0-9-]{1,40}$' then raise exception 'Use 1–40 lowercase letters, numbers or hyphens.'; end if;
  perform pg_advisory_xact_lock(hashtext(auth.uid()::text));
  if not exists(select 1 from public.mh_worlds where name=room_name) and (select count(*) from public.mh_worlds where created_by=auth.uid())>=10 then raise exception 'You can create up to 10 islands.'; end if;
  insert into public.mh_worlds(name,state,created_by) values(room_name,public.mh_seed(),auth.uid()) on conflict(name) do nothing;
  insert into public.mh_visitors(world_name,user_id) values(room_name,auth.uid()) on conflict do nothing;
  select state into s from public.mh_worlds where name=room_name;
  return s;
end; $$;

create or replace function public.mh_read_world(room_name text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare s jsonb;
begin
  if auth.uid() is null or not exists(select 1 from public.mh_visitors where world_name=room_name and user_id=auth.uid()) then raise exception 'Enter this island first.'; end if;
  select state into s from public.mh_worlds where name=room_name; return s;
end; $$;

create or replace function public.mh_capacity(tiles jsonb, tile_index int) returns int language plpgsql immutable set search_path = '' as $$
declare h int:=(tiles->tile_index->>'h')::int; x int:=tile_index%28; y int:=tile_index/28; dx int; dy int; near_count int:=0; wide_count int:=0; q jsonb;
begin
  for dy in -2..2 loop for dx in -2..2 loop
    if x+dx>=0 and x+dx<28 and y+dy>=0 and y+dy<28 then
      q:=tiles->((y+dy)*28+x+dx);
      if (q->>'h')::int>0 and (q->>'h')::int=h then
        wide_count:=wide_count+1;
        if abs(dx)<=1 and abs(dy)<=1 then near_count:=near_count+1; end if;
      end if;
    end if;
  end loop; end loop;
  return case when near_count=9 and wide_count>=21 then 80 when near_count=9 then 40 when near_count>=5 then 18 else 8 end;
end; $$;

create or replace function public.mh_settle_path(tiles jsonb, start_index int, walkers jsonb) returns jsonb language plpgsql immutable set search_path = '' as $$
declare queue int[]:=array[start_index]; paths jsonb:=jsonb_build_object(start_index::text,'[]'::jsonb); head int:=1; at_index int; path jsonb; x int; y int; nx int; ny int; n int; dx int; dy int; d int; t jsonb; q jsonb; close_home boolean; reserved boolean;
begin
 while head<=cardinality(queue) loop
  at_index:=queue[head]; head:=head+1; path:=paths->at_index::text; x:=at_index%28; y:=at_index/28; t:=tiles->at_index;
  if jsonb_array_length(path)>=2 and t->>'b' is null and not (t->>'tree')::boolean and (t->>'h')::int>=2 then
   close_home:=false;
   for dy in -1..1 loop for dx in -1..1 loop
    if x+dx>=0 and x+dx<28 and y+dy>=0 and y+dy<28 and tiles->((y+dy)*28+x+dx)->>'b'='village' then close_home:=true; end if;
   end loop; end loop;
   select exists(select 1 from jsonb_array_elements(walkers) w where (w->'path'->>-1)::int=at_index) into reserved;
   if not close_home and not reserved and public.mh_capacity(tiles,at_index)>=18 then return path; end if;
  end if;
  if jsonb_array_length(path)>=6 then continue; end if;
  for d in 0..3 loop
   dx:=case d when 0 then 1 when 2 then -1 else 0 end; dy:=case d when 1 then 1 when 3 then -1 else 0 end; nx:=x+dx; ny:=y+dy;
   if nx<0 or nx>=28 or ny<0 or ny>=28 then continue; end if;
   n:=ny*28+nx; q:=tiles->n;
   if not paths ? n::text and (q->>'h')::int>0 and abs((q->>'h')::int-(t->>'h')::int)<=1 then
    queue:=array_append(queue,n); paths:=paths||jsonb_build_object(n::text,path||to_jsonb(n));
   end if;
  end loop;
 end loop;
 return null;
end; $$;

create or replace function public.mh_step_world(room_name text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare s jsonb; last_time timestamptz; ts jsonb; t jsonb; q jsonb; age int; shrines int:=0; i int; population int; total_people int:=0; capacity int; tier int; walkers jsonb; next_walkers jsonb:='[]'; walker jsonb; path jsonb; at_index int; next_index int; home_index int; waits int; ev jsonb; hands_people int; rival_people int; hands_villages int; rival_villages int; target int; site int:=-1; last_expansion int; attacker_owner text; defenders int; citadel boolean;
begin
  if auth.uid() is null or not exists(select 1 from public.mh_visitors where world_name=room_name and user_id=auth.uid()) then raise exception 'Enter this island first.'; end if;
  select state,last_tick into s,last_time from public.mh_worlds where name=room_name for update;
  if clock_timestamp()-last_time < interval '4 seconds' then return s; end if;
  -- Always exactly one step: days or months of absence never accumulate ticks.
  age := (s->>'age')::int+1; ts := s->'tiles'; walkers:=coalesce(s->'walkers','[]'::jsonb); ev:=s->'events';
  select coalesce(sum((value->>'p')::int),0) into total_people from jsonb_array_elements(ts) where coalesce(value->>'owner','hands')='hands';
  select total_people+coalesce(sum((value->>'p')::int),0) into total_people from jsonb_array_elements(walkers);
  for walker in select value from jsonb_array_elements(walkers) loop
    path:=walker->'path'; at_index:=(walker->>'at')::int; next_index:=(path->>0)::int;
    if next_index is null then continue; end if;
    t:=ts->at_index; q:=ts->next_index;
    if (q->>'h')::int=0 or abs((q->>'h')::int-(t->>'h')::int)>1 then
      waits:=coalesce((walker->>'wait')::int,0)+1;
      if waits<15 then next_walkers:=next_walkers||jsonb_build_array(walker||jsonb_build_object('wait',waits)); end if;
      continue;
    end if;
    path:=path-0;walker:=walker||jsonb_build_object('from',at_index,'at',next_index,'path',path,'wait',0);
    if jsonb_array_length(path)>0 then next_walkers:=next_walkers||jsonb_build_array(walker);continue;end if;
    attacker_owner:=coalesce(walker->>'owner','hands');
    if q->>'b'='village' and coalesce(q->>'owner','hands')<>attacker_owner then
      defenders:=(q->>'p')::int;
      if (walker->>'p')::int>=defenders then
        citadel:=public.mh_capacity(ts,next_index)=80;
        ts:=jsonb_set(ts,array[next_index::text],q||jsonb_build_object('owner',attacker_owner,'p',greatest(1,(walker->>'p')::int-defenders)));
        ev:=jsonb_build_array(jsonb_build_object('text',case when citadel then 'A citadel falls. The war is won.' else 'A rival settlement changes hands.' end,'age',age))||ev;
        if citadel then s:=s||jsonb_build_object('winner',attacker_owner); end if;
      else
        ts:=jsonb_set(ts,array[next_index::text,'p'],to_jsonb(defenders-(walker->>'p')::int));
        ev:=jsonb_build_array(jsonb_build_object('text','The defenders hold their settlement.','age',age))||ev;
      end if;
    elsif q->>'b' is null and not (q->>'tree')::boolean and (q->>'h')::int>=2 then
      ts:=jsonb_set(ts,array[next_index::text],q||jsonb_build_object('b','village','p',(walker->>'p')::int,'owner',coalesce(walker->>'owner','hands')));
      ev:=jsonb_build_array(jsonb_build_object('text','Settlers found a new home.','age',age))||ev;
      select coalesce(jsonb_agg(value),'[]'::jsonb) into ev from (select value from jsonb_array_elements(ev) with ordinality e(value,n) order by n limit 12) recent;
    else
      home_index:=(walker->>'home')::int;q:=ts->home_index;
      if q->>'b'='village' then ts:=jsonb_set(ts,array[home_index::text,'p'],to_jsonb((q->>'p')::int+(walker->>'p')::int)); end if;
    end if;
  end loop;
  for i in 0..783 loop
    t:=ts->i;
    if t->>'b'='shrine' then shrines:=shrines+1; end if;
    if age%3=0 and t->>'b'='village' and coalesce(t->>'owner','hands')='hands' then
      capacity:=public.mh_capacity(ts,i); tier:=case capacity when 80 then 3 when 40 then 2 when 18 then 1 else 0 end;
      population:=least(capacity,(t->>'p')::int+tier+1);
      if population>=capacity then
        path:=public.mh_settle_path(ts,i,next_walkers);
        if path is not null then population:=population-4;next_walkers:=next_walkers||jsonb_build_array(jsonb_build_object('at',i,'from',i,'home',i,'path',path,'p',4,'wait',0,'owner','hands'));end if;
      end if;
      ts:=jsonb_set(ts,array[i::text,'p'],to_jsonb(population));
    end if;
  end loop;
  -- Rival growth mirrors the hands already active in this exact tick.
  select coalesce(sum((value->>'p')::int),0), count(*) filter (where value->>'b'='village') into hands_people,hands_villages from jsonb_array_elements(ts) where coalesce(value->>'owner','hands')='hands';
  select hands_people+coalesce(sum((value->>'p')::int),0) into hands_people from jsonb_array_elements(next_walkers) where coalesce(value->>'owner','hands')='hands';
  select coalesce(sum((value->>'p')::int),0), count(*) filter (where value->>'b'='village') into rival_people,rival_villages from jsonb_array_elements(ts) where value->>'owner'='rival';
  target:=greatest(15,round(hands_people*.9+4));
  if age%3=0 and rival_people<target then
    for i in 0..783 loop
      t:=ts->i;
      if t->>'b'='village' and t->>'owner'='rival' and rival_people<target then
        population:=least(public.mh_capacity(ts,i),(t->>'p')::int+1);
        rival_people:=rival_people+population-(t->>'p')::int;
        ts:=jsonb_set(ts,array[i::text,'p'],to_jsonb(population));
      end if;
    end loop;
  end if;
  last_expansion:=coalesce((s->'rival'->>'lastExpansion')::int,0);
  if hands_villages>rival_villages and age-last_expansion>=9 then
    for i in reverse 24..14 loop
      for population in 3..24 loop
        t:=ts->(population*28+i);
        if t->>'b' is null and not (t->>'tree')::boolean and (t->>'h')::int>=2 and public.mh_capacity(ts,population*28+i)>=18 then site:=population*28+i; exit; end if;
      end loop;
      if site<>-1 then exit; end if;
    end loop;
    if site<>-1 then
      ts:=jsonb_set(ts,array[site::text],(ts->site)||jsonb_build_object('b','village','p',3,'tree',false,'owner','rival'));
      s:=s||jsonb_build_object('rival',jsonb_build_object('phase',coalesce(s->'rival'->>'phase','watching'),'lastExpansion',age));
      ev:=jsonb_build_array(jsonb_build_object('text','Across the water, another rival banner rises.','age',age))||ev;
    end if;
  end if;
  select count(*) filter (where value->>'b'='village') into rival_villages from jsonb_array_elements(ts) where value->>'owner'='rival';
  if hands_villages>=6 and rival_villages>=6 and coalesce(s->'rival'->>'phase','watching')='watching' then
    s:=s||jsonb_build_object('rival',jsonb_build_object('phase','contested','lastExpansion',coalesce((s->'rival'->>'lastExpansion')::int,0)));
    ev:=jsonb_build_array(jsonb_build_object('text','The two civilizations can see each other. Prepare your people.','age',age))||ev;
  end if;
  select coalesce(jsonb_agg(value),'[]'::jsonb) into ev from (select value from jsonb_array_elements(ev) with ordinality e(value,n) order by n limit 12) recent;
  s:=s || jsonb_build_object('tiles',ts,'walkers',next_walkers,'events',ev,'age',age,'version',(s->>'version')::int+1,'mana',least(120,(s->>'mana')::int+2+total_people/12+shrines*2));
  update public.mh_worlds set state=s,last_tick=clock_timestamp() where name=room_name;
  return s;
end; $$;

create or replace function public.mh_edit_world(room_name text,action_name text,tile_index int) returns jsonb language plpgsql security definer set search_path = '' as $$
declare s jsonb; t jsonb; ts jsonb; cost int; h int; j int; q jsonb; message text; last_action timestamptz; ev jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  select last_edit into last_action from public.mh_visitors where world_name=room_name and user_id=auth.uid() for update;
  if not found then raise exception 'Enter this island first.'; end if;
  if clock_timestamp()-last_action < interval '150 milliseconds' then raise exception 'Let the earth settle for a moment.'; end if;
  cost:=case action_name when 'raise' then 1 when 'lower' then 1 when 'forest' then 4 when 'village' then 15 when 'shrine' then 20 when 'rain' then 10 else null end;
  if cost is null or tile_index is null or tile_index<0 or tile_index>783 then raise exception 'Choose a valid power and tile.'; end if;
  select state into s from public.mh_worlds where name=room_name for update;
  if (s->>'mana')::int<cost then raise exception 'Faith is returning. Give it a moment.'; end if;
  ts:=s->'tiles'; t:=ts->tile_index; h:=(t->>'h')::int;
  if action_name='raise' and h>=7 then raise exception 'This peak is high enough.'; end if;
  if action_name='lower' and h=0 then raise exception 'You have reached the seabed.'; end if;
  if action_name in ('forest','village','shrine') and (h<2 or t->>'b' is not null or (t->>'tree')::boolean) then raise exception 'Choose clear land above the shore.'; end if;
  if action_name='rain' and h<1 then raise exception 'Bring rain to the land.'; end if;
  case action_name
    when 'raise' then t:=t||jsonb_build_object('h',h+1); message:='A new height rises from the earth.';
    when 'lower' then t:=t||jsonb_build_object('h',h-1,'tree',case when h-1<2 then false else (t->>'tree')::boolean end); if h=1 then t:=t||'{"b":null,"p":0}'::jsonb; end if; message:='The landscape opens.';
    when 'forest' then t:=t||'{"tree":true}'::jsonb; message:='A grove takes root.';
    when 'village' then t:=t||'{"b":"village","p":3}'::jsonb; message:='A new settlement begins.';
    when 'shrine' then t:=t||'{"b":"shrine"}'::jsonb; message:='A shrine catches the light.';
    when 'rain' then message:='Gentle rain blesses the fields.';
  end case;
  ts:=jsonb_set(ts,array[tile_index::text],t);
  if action_name='rain' then
    for j in 0..783 loop q:=ts->j;
      if abs(j%28-tile_index%28)<=2 and abs(j/28-tile_index/28)<=2 and q->>'b'='village' then ts:=jsonb_set(ts,array[j::text,'p'],to_jsonb(least(public.mh_capacity(ts,j),(q->>'p')::int+2))); end if;
    end loop;
  end if;
  select coalesce(jsonb_agg(value),'[]'::jsonb) into ev from (select value from jsonb_array_elements(s->'events') with ordinality e(value,n) order by n limit 11) recent;
  s:=s||jsonb_build_object('tiles',ts,'mana',(s->>'mana')::int-cost,'version',(s->>'version')::int+1,'events',jsonb_build_array(jsonb_build_object('text',message,'age',(s->>'age')::int))||ev);
  update public.mh_worlds set state=s where name=room_name;
  update public.mh_visitors set last_edit=clock_timestamp() where world_name=room_name and user_id=auth.uid();
  return s;
end; $$;

revoke all on function public.mh_seed() from public;
revoke all on function public.mh_capacity(jsonb,int) from public;
revoke all on function public.mh_settle_path(jsonb,int,jsonb) from public;
revoke all on function public.mh_enter_world(text), public.mh_read_world(text), public.mh_step_world(text), public.mh_edit_world(text,text,int) from public;
grant execute on function public.mh_enter_world(text), public.mh_read_world(text), public.mh_step_world(text), public.mh_edit_world(text,text,int) to authenticated;
