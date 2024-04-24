import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UserjourneyComponent } from './userjourney.component';

describe('UserjourneyComponent', () => {
  let component: UserjourneyComponent;
  let fixture: ComponentFixture<UserjourneyComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UserjourneyComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(UserjourneyComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
