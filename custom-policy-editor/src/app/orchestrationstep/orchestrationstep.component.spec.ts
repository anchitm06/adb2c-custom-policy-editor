import { ComponentFixture, TestBed } from '@angular/core/testing';

import { OrchestrationstepComponent } from './orchestrationstep.component';

describe('OrchestrationstepComponent', () => {
  let component: OrchestrationstepComponent;
  let fixture: ComponentFixture<OrchestrationstepComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OrchestrationstepComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(OrchestrationstepComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
